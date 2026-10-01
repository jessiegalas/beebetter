import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

// Invoke from Supabase Cron with x-notification-secret; never expose these secrets to mobile.
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const secret = Deno.env.get('QUEST_NOTIFICATION_SECRET');
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const headers = { 'Content-Type': 'application/json', ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}) };

async function expo(path: string, body: unknown) {
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Expo HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors || !result.data) throw new Error('Invalid Expo response');
  return result.data;
}

async function update(id: string, values: Record<string, unknown>) {
  const { error } = await db.from('quest_push_deliveries').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!secret || request.headers.get('x-notification-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  try {
    // Receipts report provider acceptance, not that the user saw the notification.
    const { data: sent, error: receiptQueryError } = await db.from('quest_push_deliveries')
      .select('id,token,ticket_id,updated_at').eq('status', 'sent')
      .lt('updated_at', new Date(Date.now() - 15 * 60_000).toISOString()).limit(100);
    if (receiptQueryError) throw receiptQueryError;
    if (sent?.length) {
      const receipts = await expo('getReceipts', { ids: sent.map(row => row.ticket_id) });
      for (const row of sent) {
        const receipt = receipts[row.ticket_id];
        if (!receipt) {
          if (Date.parse(row.updated_at) < Date.now() - 24 * 60 * 60_000) await update(row.id, { status: 'failed', last_error: 'Receipt expired' });
          continue;
        }
        await update(row.id, { status: receipt.status === 'ok' ? 'delivered' : 'failed', last_error: receipt.details?.error ?? null });
        if (receipt.details?.error === 'DeviceNotRegistered') {
          const { error } = await db.from('quest_push_devices').delete().eq('token', row.token);
          if (error) throw error;
        }
      }
    }

    const { data: jobs, error } = await db.rpc('claim_quest_push_deliveries');
    if (error) throw error;
    if (!jobs?.length) return Response.json({ sent: 0 });
    try {
      const tickets = await expo('send', jobs.map((job: { delivery_id: string; token: string; owner_id: string; quest_id: string; title: string; kind: string; can_complete: boolean }) => ({
        to: job.token, title: job.kind === 'scheduled' ? 'Time for your quest' : 'Quest due in one hour',
        body: job.title, sound: 'default', channelId: 'quests', ttl: 900,
        categoryId: job.can_complete ? 'QUEST_ACTIONS' : 'QUEST_OPEN',
        data: { questId: job.quest_id, ownerId: job.owner_id, notificationId: job.delivery_id, kind: job.kind },
      })));
      if (!Array.isArray(tickets) || tickets.length !== jobs.length) throw new Error('Invalid ticket count');
      for (let i = 0; i < jobs.length; i++) {
        const ticket = tickets[i];
        const retry = ticket.details?.error === 'MessageRateExceeded';
        await update(jobs[i].delivery_id, {
          status: ticket.status === 'ok' && ticket.id ? 'sent' : retry ? 'pending' : 'failed', ticket_id: ticket.id ?? null,
          ...(retry ? { available_at: new Date(Date.now() + 60_000).toISOString() } : {}),
          last_error: ticket.details?.error ?? null,
        });
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const { error: deleteError } = await db.from('quest_push_devices').delete().eq('token', jobs[i].token);
          if (deleteError) throw deleteError;
        }
      }
    } catch (sendError) {
      // Only still-leased jobs retry. Already recorded tickets must not be resent.
      const { error: retryError } = await db.from('quest_push_deliveries').update({
        status: 'pending', available_at: new Date(Date.now() + 60_000).toISOString(), last_error: 'Send failed; retry pending',
      }).in('id', jobs.map((job: { delivery_id: string }) => job.delivery_id)).eq('status', 'sending');
      if (retryError) throw retryError;
      throw sendError;
    }
    return Response.json({ sent: jobs.length });
  } catch (error) {
    console.error('Quest notification worker failed', error instanceof Error ? error.message : 'Unknown error');
    return new Response('Notification worker failed', { status: 500 });
  }
});
