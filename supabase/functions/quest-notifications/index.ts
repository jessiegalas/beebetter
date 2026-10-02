import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const secret = Deno.env.get('QUEST_NOTIFICATION_SECRET');
const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
const headers = { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const knownCodes = new Set(['DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidCredentials', 'UNAUTHORIZED']);
type Job = { delivery_id: string; token: string; owner_id: string; quest_id: string; title: string; kind: string;
  can_complete: boolean; due_at: string; attempts: number; claim_id: string; device_registered_at: string };
type ReceiptRow = { id: string; token: string; ticket_id: string; sent_at: string; receipt_available_at: string; device_registered_at: string | null };
type Ticket = { status?: string; id?: string; details?: { error?: string } };
class ProviderError extends Error {
  constructor(readonly code: string, readonly retryable = false) { super(code); }
}
function providerCode(ticket: Ticket) { const code = ticket.details?.error; return code && knownCodes.has(code) ? code : 'ProviderRejected'; }
function errorCode(error: unknown) { return error instanceof ProviderError ? error.code : 'DatabaseOrWorkerError'; }
async function expo(path: string, body: unknown) {
  let response: Response;
  try { response = await fetch('https://exp.host/--/api/v2/push/' + path, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  }); } catch { throw new ProviderError('ExpoNetworkError', true); }
  if (!response.ok) throw new ProviderError('ExpoHttp' + response.status, response.status === 429 || response.status >= 500);
  let result;
  try { result = await response.json(); } catch { throw new ProviderError('InvalidExpoResponse', true); }
  if (result.errors || !result.data) throw new ProviderError('InvalidExpoResponse');
  return result.data;
}
async function updateClaim(job: Job, values: Record<string, unknown>) {
  const { data, error } = await db.from('quest_push_deliveries').update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', job.delivery_id).eq('claim_id', job.claim_id).eq('status', 'sending')
    .gt('updated_at', new Date(Date.now() - 2 * 60_000).toISOString()).select('id');
  if (error) throw error;
  return Boolean(data?.length);
}
async function removeInvalidDevice(token: string, registeredAt: string | null) {
  if (!registeredAt) return; // Legacy tickets must not revoke a newer device registration.
  const { error } = await db.from('quest_push_devices').delete().eq('token', token).lte('updated_at', registeredAt);
  if (error) throw error;
}
function retryAt(attempts: number) { return new Date(Date.now() + 60_000 * 2 ** Math.max(0, attempts - 1)).toISOString(); }

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!secret || request.headers.get('x-notification-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  const mode = Deno.env.get('QUEST_NOTIFICATION_MODE') ?? 'off';
  const ownerIds = (Deno.env.get('QUEST_NOTIFICATION_TEST_OWNER_IDS') ?? '').split(',').map(id => id.trim()).filter(Boolean);
  if (!['off', 'test', 'all'].includes(mode) || (mode === 'test' && (!ownerIds.length || ownerIds.some(id => !uuid.test(id))))) {
    return Response.json({ error: 'InvalidWorkerConfiguration' }, { status: 503 });
  }
  const counts = { claimed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0, stale: 0, receipts_checked: 0, provider_accepted: 0 };
  if (mode === 'off') return Response.json({ mode, ...counts });
  const errors: string[] = [];
  const scope = mode === 'test' ? ownerIds : null;
  let jobs: Job[] = [];

  // Sending and receipts have independent failure boundaries.
  try {
    const { data, error } = await db.rpc('claim_quest_push_deliveries', { owner_ids_value: scope });
    if (error) throw error;
    jobs = data ?? [];
    counts.claimed = jobs.length;
    const scopedJobs = jobs.filter(job => !scope || scope.includes(job.owner_id));
    const { data: validClaims, error: validationError } = await db.rpc('validate_quest_push_claims', {
      claims_value: scopedJobs.map(job => ({ delivery_id: job.delivery_id, claim_id: job.claim_id })),
    });
    if (validationError) throw validationError;
    const currentIds = new Set((validClaims ?? []).map((row: { delivery_id: string }) => row.delivery_id));
    const eligible: Job[] = [];
    for (const job of jobs) {
      if (scope && !scope.includes(job.owner_id)) { counts.stale++; continue; }
      if (!uuid.test(job.claim_id) || !Number.isFinite(Date.parse(job.due_at))) throw new ProviderError('InvalidClaim');
      if (Date.parse(job.due_at) <= Date.now() - 15 * 60_000) {
        if (await updateClaim(job, { status: 'cancelled', last_error: 'ReminderExpired' })) counts.cancelled++;
        continue;
      }
      if (currentIds.has(job.delivery_id)) eligible.push(job); else counts.stale++;
    }
    if (eligible.length) {
      // Android needs Expo's background task to present action categories.
      // Top-level title/body/channelId would let FCM display without buttons.
      const tickets = await expo('send', eligible.map(job => ({
        to: job.token, priority: 'high',
        ttl: Math.max(1, Math.min(900, Math.floor((Date.parse(job.due_at) + 15 * 60_000 - Date.now()) / 1000))),
        data: { transport: 'quest-push-v1',
          title: job.kind === 'scheduled' ? 'Time for your quest' : 'Quest due in one hour',
          message: job.title, categoryId: job.can_complete ? 'QUEST_ACTIONS' : 'QUEST_OPEN',
          expiresAt: new Date(Date.parse(job.due_at) + 15 * 60_000).toISOString(),
          questId: job.quest_id, ownerId: job.owner_id, notificationId: job.delivery_id, kind: job.kind },
      })));
      if (!Array.isArray(tickets) || tickets.length !== eligible.length) throw new ProviderError('InvalidTicketCount', true);
      for (let i = 0; i < eligible.length; i++) {
        const job = eligible[i];
        const ticket: Ticket = tickets[i];
        const code = providerCode(ticket);
        const accepted = ticket.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0;
        const retry = code === 'MessageRateExceeded' && job.attempts < 3;
        const sentAt = new Date().toISOString();
        const changed = await updateClaim(job, {
          status: accepted ? 'sent' : retry ? 'pending' : 'failed', ticket_id: accepted ? ticket.id : null,
          sent_at: accepted ? sentAt : null,
          receipt_available_at: accepted ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
          ...(retry ? { available_at: retryAt(job.attempts) } : {}), last_error: accepted ? null : code,
        });
        if (!changed) { counts.stale++; continue; }
        if (accepted) counts.sent++; else if (retry) counts.retried++; else counts.failed++;
        if (code === 'DeviceNotRegistered' && !accepted) await removeInvalidDevice(job.token, job.device_registered_at);
      }
    }
  } catch (error) {
    errors.push(errorCode(error));
    // Only this invocation's still-owned leases may retry an ambiguous send.
    for (const job of jobs) {
      if (scope && !scope.includes(job.owner_id)) continue;
      try {
        const retry = (!(error instanceof ProviderError) || error.retryable) && job.attempts < 3;
        if (await updateClaim(job, { status: retry ? 'pending' : 'failed',
          ...(retry ? { available_at: retryAt(job.attempts) } : {}), last_error: errorCode(error) })) {
          if (retry) counts.retried++; else counts.failed++;
        }
      } catch { errors.push('ClaimUpdateFailed'); }
    }
  }

  try {
    let query = db.from('quest_push_deliveries')
      .select('id,token,ticket_id,sent_at,receipt_available_at,device_registered_at,quests!inner(owner_id)')
      .eq('status', 'sent').lte('receipt_available_at', new Date().toISOString())
      .order('receipt_available_at').order('id').limit(100);
    if (scope) query = query.in('quests.owner_id', scope);
    const { data: rows, error } = await query;
    if (error) throw error;
    if (rows?.length) {
      let receipts: Record<string, Ticket> = {};
      let receiptError: string | null = null;
      try { receipts = await expo('getReceipts', { ids: rows.map(row => row.ticket_id) }); }
      catch (error) { receiptError = errorCode(error); errors.push(receiptError); }
      for (const row of rows as ReceiptRow[]) {
        const receipt = receipts[row.ticket_id];
        const expired = Date.parse(row.sent_at) <= Date.now() - 24 * 60 * 60_000;
        const valid = receipt?.status === 'ok' || receipt?.status === 'error';
        const code = valid && receipt.status === 'error' ? providerCode(receipt) : null;
        const values = valid ? { status: receipt.status === 'ok' ? 'delivered' : 'failed', last_error: code }
          : expired ? { status: 'failed', last_error: 'ReceiptExpired' }
          : { receipt_available_at: new Date(Date.now() + 5 * 60_000).toISOString(), last_error: receiptError };
        const { data: changed, error: updateError } = await db.from('quest_push_deliveries')
          .update({ ...values, updated_at: new Date().toISOString() }).eq('id', row.id)
          .eq('status', 'sent').eq('ticket_id', row.ticket_id).eq('receipt_available_at', row.receipt_available_at).select('id');
        if (updateError) throw updateError;
        if (!changed?.length) { counts.stale++; continue; }
        counts.receipts_checked++;
        if (valid && receipt.status === 'ok') counts.provider_accepted++;
        if (values.status === 'failed') counts.failed++;
        if (code === 'DeviceNotRegistered') await removeInvalidDevice(row.token, row.device_registered_at);
      }
    }
  } catch (error) { errors.push(errorCode(error)); }
  const result = { mode, ...counts, errors: [...new Set(errors)] };
  console.log('Quest notification worker', JSON.stringify(result));
  return Response.json(result, { status: errors.length ? 503 : 200 });
});
