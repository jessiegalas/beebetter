import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { Badge, Button, ChoiceChip, Field, Surface } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { InlineMessage, PrivacyNote, WellnessHeader } from '@/components/wellness-ui';
import { useBeePalette, useBeeStyles, type BeePalette, Borders, Controls, Radii, SectionColumn, Spacing, Typography } from '@/constants/theme';
import { useUserData } from '@/hooks/use-user-data';
import { createMySupportRequest, listMySupportRequests, withdrawMySupportRequest, type SupportRequest } from '@/lib/wellbeing-data';

const CATEGORIES: { value: SupportRequest['category']; label: string }[] = [
  { value: 'academic', label: 'Academic' }, { value: 'personal', label: 'Personal' },
  { value: 'wellbeing', label: 'Well-being' }, { value: 'financial', label: 'Financial' },
  { value: 'safety', label: 'Safety' }, { value: 'other', label: 'Other' },
];
const CONTACTS: { value: SupportRequest['preferred_contact']; label: string; hint: string }[] = [
  { value: 'email', label: 'Email', hint: 'OSAS may use your account email or the detail below.' },
  { value: 'phone', label: 'Phone', hint: 'Add the phone number OSAS should use.' },
  { value: 'in_person', label: 'In person', hint: 'OSAS can coordinate a suitable meeting.' },
  { value: 'in_app', label: 'In app', hint: 'This records your preference; in-app messaging is not currently available.' },
];
const PRIORITIES: { value: SupportRequest['priority']; label: string }[] = [
  { value: 'normal', label: 'Normal' }, { value: 'soon', label: 'Soon' }, { value: 'urgent', label: 'Urgent' },
];
const STATUS_LABELS: Record<SupportRequest['status'], string> = {
  submitted: 'Submitted', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved', withdrawn: 'Withdrawn' };

export default function SupportRequestsScreen() {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const { profile, user } = useUserData();
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [category, setCategory] = useState<SupportRequest['category']>('academic');
  const [contact, setContact] = useState<SupportRequest['preferred_contact']>('email');
  const [priority, setPriority] = useState<SupportRequest['priority']>('normal');
  const [message, setMessage] = useState('');
  const [contactDetail, setContactDetail] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setRequests(await listMySupportRequests(user.id)); }
    catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Could not load your requests.', tone: 'error' }); }
    finally { setLoading(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const submit = async () => {
    if (!user || !message.trim()) { setFeedback({ message: 'Describe the concern you want OSAS to review.', tone: 'error' }); return; }
    if (!consent) { setFeedback({ message: 'Explicit consent is required before identifiable information can be sent.', tone: 'error' }); return; }
    if (contact === 'phone' && !contactDetail.trim()) { setFeedback({ message: 'Enter the phone number you want OSAS to use.', tone: 'error' }); return; }
    setSaving(true); setFeedback(null);
    try {
      const saved = await createMySupportRequest(user.id, { category, message, preferred_contact: contact, contact_detail: contactDetail, consent_to_contact: true, priority });
      setRequests(current => [saved, ...current]); setMessage(''); setContactDetail(''); setConsent(false); setPriority('normal');
      setFeedback({ message: 'Your request was submitted to authorized OSAS support personnel.', tone: 'success' });
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : 'Could not submit your request.', tone: 'error' }); }
    finally { setSaving(false); }
  };
  const withdraw = (request: SupportRequest) => Alert.alert('Withdraw this request?', 'OSAS will no longer manage this request. This action cannot be reversed in the app.', [
    { text: 'Keep request', style: 'cancel' },
    { text: 'Withdraw', style: 'destructive', onPress: () => {
      setWithdrawing(request.id); setFeedback(null);
      void withdrawMySupportRequest(request.id).then(saved => {
        setRequests(current => current.map(item => item.id === saved.id ? saved : item));
        setFeedback({ message: 'The request was withdrawn.', tone: 'success' });
      }).catch(error => setFeedback({ message: error instanceof Error ? error.message : 'Could not withdraw this request.', tone: 'error' }))
        .finally(() => setWithdrawing(null));
    } },
  ]);

  return <View style={styles.container}><SafeAreaView style={styles.safeArea} edges={['top']}>
    <WellnessHeader title="Support requests" subtitle="Ask authorized OSAS personnel for assistance" />
    <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <PrivacyNote>A request shares your identity, student information, concern, contact preference, and contact detail with personnel authorized to manage OSAS support cases. It does not share your private check-ins, reflections, quests, or location.</PrivacyNote>
        <View style={styles.notice}><Ionicons name="time-outline" size={20} color={COLORS.honeyDeep} /><ThemedText style={styles.noticeText}>Submitting is voluntary and does not guarantee an immediate response. If you are in immediate danger, contact local emergency services or a trusted campus office directly.</ThemedText></View>
        <Surface>
          <ThemedText type="subtitle">New request</ThemedText>
          <ChoiceGroup title="Concern category" options={CATEGORIES} value={category} onChange={value => setCategory(value as SupportRequest['category'])} />
          <Field label="Describe your concern" hint="Share only what authorized OSAS personnel need to understand your request."
            value={message} onChangeText={setMessage} maxLength={2000} multiline textAlignVertical="top" placeholder="How can OSAS support you?" />
          <ThemedText style={styles.counter}>{message.length}/2000</ThemedText>
          <ChoiceGroup title="Preferred contact" options={CONTACTS} value={contact} onChange={value => setContact(value as SupportRequest['preferred_contact'])} />
          <Field label="Contact detail" hint={CONTACTS.find(item => item.value === contact)?.hint}
            value={contactDetail} onChangeText={setContactDetail} maxLength={254}
            placeholder={contact === 'phone' ? 'Phone number' : contact === 'email' ? profile?.email || 'Email address' : 'Optional contact detail'} />
          <ChoiceGroup title="Requested response" options={PRIORITIES} value={priority} onChange={value => setPriority(value as SupportRequest['priority'])} />
          <TouchableOpacity style={styles.consentRow} onPress={() => setConsent(value => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
            <View style={[styles.checkbox, consent && styles.checkboxChecked]}>{consent && <Ionicons name="checkmark" size={20} color={COLORS.accentForeground} />}</View>
            <ThemedText style={styles.consentText}>I voluntarily consent to OSAS receiving my identifiable request and contacting me using my selected preference.</ThemedText>
          </TouchableOpacity>
          {feedback && <InlineMessage {...feedback} />}
          <Button label={'Submit request'} loading={saving} onPress={() => void submit()} />
        </Surface>
        <View style={styles.resourceCard}><Ionicons name="information-circle-outline" size={22} color={COLORS.honeyDeep} /><View style={styles.flex}><ThemedText style={styles.sectionTitle}>Institutional resources</ThemedText><ThemedText style={styles.body}>No verified institutional resource links are configured in BeeBetter yet. Contact your campus OSAS office directly for currently approved services and contact details.</ThemedText></View></View>
        <View style={styles.historyHeader}>
          <ThemedText type="subtitle">My requests</ThemedText>
          <Button label="Refresh" intent="quiet" accessibilityLabel="Refresh support requests" onPress={() => void load()} />
        </View>
        {loading ? <View style={styles.loading}><ActivityIndicator color={COLORS.honeyDark} /><ThemedText style={styles.body}>Loading your requests…</ThemedText></View> : requests.length ? requests.map(request => <RequestCard key={request.id} request={request} withdrawing={withdrawing === request.id} onWithdraw={() => withdraw(request)} />) : <View style={styles.empty}><Ionicons name="chatbox-ellipses-outline" size={28} color={COLORS.muted} /><ThemedText style={styles.sectionTitle}>No support requests</ThemedText><ThemedText style={styles.body}>Requests you choose to submit will appear here.</ThemedText></View>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></View>;
}

function ChoiceGroup({ title, options, value, onChange }: { title: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  const styles = useBeeStyles(makeStyles);
  return <View>
    <ThemedText type="label">{title}</ThemedText>
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={title}>
      {options.map(option => <ChoiceChip key={option.value} role="radio" label={option.label}
        selected={value === option.value} onPress={() => onChange(option.value)} />)}
    </View>
  </View>;
}
function RequestCard({ request, withdrawing, onWithdraw }: { request: SupportRequest; withdrawing: boolean; onWithdraw: () => void }) {
  const styles = useBeeStyles(makeStyles);
  const eligible = ['submitted', 'acknowledged', 'in_progress'].includes(request.status);
  return <Surface>
    <View style={styles.requestTop}>
      <View style={styles.flex}>
        <ThemedText type="item">{CATEGORIES.find(item => item.value === request.category)?.label ?? request.category} support</ThemedText>
        <ThemedText style={styles.body}>{new Date(request.created_at).toLocaleString()}</ThemedText>
      </View>
      <Badge label={STATUS_LABELS[request.status]} />
    </View>
    <ThemedText>{request.message}</ThemedText>
    <View style={styles.meta}>
      <ThemedText style={styles.body}>Contact: {CONTACTS.find(item => item.value === request.preferred_contact)?.label}</ThemedText>
      <ThemedText style={styles.body}>Priority: {request.priority}</ThemedText>
    </View>
    {request.resolution_note && <View style={styles.followUp}>
      <ThemedText type="label">OSAS follow-up</ThemedText>
      <ThemedText style={styles.body}>{request.resolution_note}</ThemedText>
      {request.resolved_at && <ThemedText style={styles.hint}>Resolved {new Date(request.resolved_at).toLocaleString()}</ThemedText>}
    </View>}
    {eligible && <Button label={withdrawing ? 'Withdrawing…' : 'Withdraw request'} intent="destructive" loading={withdrawing} onPress={onWithdraw} />}
  </Surface>;
}
const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' }, safeArea: { flex: 1 }, flex: { flex: 1, minWidth: 0 },
  content: SectionColumn,
  hint: { ...Typography.metadata, color: COLORS.muted, marginTop: Spacing.half }, body: { ...Typography.body, color: COLORS.muted },
  notice: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radii.md, backgroundColor: COLORS.surfaceWarm }, noticeText: { ...Typography.metadata, flex: 1, color: COLORS.ink },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  counter: { ...Typography.metadata, color: COLORS.muted, textAlign: 'right' },
  consentRow: { minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md, borderRadius: Radii.md, backgroundColor: COLORS.surfaceWarm }, checkbox: { width: Spacing.xl, height: Spacing.xl, borderRadius: Radii.sm, borderWidth: Borders.default, borderColor: COLORS.muted, alignItems: 'center', justifyContent: 'center' }, checkboxChecked: { backgroundColor: COLORS.honey, borderColor: COLORS.honeyDark }, consentText: { ...Typography.metadata, flex: 1, color: COLORS.ink },
  resourceCard: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.gutter, borderRadius: Radii.xl, backgroundColor: COLORS.card, borderWidth: 0, borderColor: COLORS.surfaceMuted }, sectionTitle: { ...Typography.section, color: COLORS.ink }, historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  loading: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }, empty: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.section, borderRadius: Radii.lg, backgroundColor: COLORS.card },
  requestTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: Spacing.md },
  meta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm },
  followUp: { gap: Spacing.xs, padding: Spacing.md, borderRadius: Radii.md, backgroundColor: COLORS.surface },
});
