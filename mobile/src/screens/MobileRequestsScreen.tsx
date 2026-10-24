import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  cancelMobileRequest,
  createMobileRequest,
  fulfillMobileRequest,
  getMobileWorkspace,
  pledgeMobileRequest,
  reviewMobileRequest,
  scheduleMobileRequest,
  withdrawMobilePledge,
} from '../api';
import type { MobileRequest, MobileWorkspace } from '../api';
import { colors, radius } from '../theme';

const bloodTypes = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const urgencies = ['moderate', 'urgent', 'critical'];
const components = [
  ['wholeBlood', 'Whole blood'], ['packedRBC', 'Packed red cells'],
  ['plateletConcentrate', 'Platelets'], ['freshFrozenPlasma', 'Fresh frozen plasma'],
  ['cryoprecipitate', 'Cryoprecipitate'], ['plateletApheresis', 'Platelet apheresis'],
] as const;

interface FormValues {
  patientName: string; patientAge: string; bloodType: string; unitsRequired: string;
  bloodComponents: string[]; wholeBloodVolume: string; indicationOfTransfusion: string;
  hospitalName: string; hospitalAddress: string; city: string; province: string;
  contactPerson: string; contactNumber: string; email: string; urgency: string;
  requiredByDate: string; notes: string; [key: string]: string | string[];
}
const initialForm = (): FormValues => ({
  patientName: '', patientAge: '', bloodType: 'O+', unitsRequired: '1',
  bloodComponents: ['wholeBlood'], wholeBloodVolume: '1 unit', indicationOfTransfusion: '',
  hospitalName: '', hospitalAddress: '', city: '', province: 'Oriental Mindoro',
  contactPerson: '', contactNumber: '', email: '', urgency: 'moderate',
  requiredByDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), notes: '',
});
const makeOperationKey = () => `mobile${Date.now()}${Math.random().toString(36).slice(2, 13)}`;
const localDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function MobileRequestsScreen() {
  const [workspace, setWorkspace] = useState<MobileWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormValues>(initialForm);
  const [busy, setBusy] = useState(false);
  const [busyRequest, setBusyRequest] = useState<number | null>(null);
  const [declineReasons, setDeclineReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submissionKey, setSubmissionKey] = useState(makeOperationKey);
  const [schedulePanel, setSchedulePanel] = useState<number | null>(null);
  const [fulfillPanel, setFulfillPanel] = useState<number | null>(null);
  const [selectedDonor, setSelectedDonor] = useState<Record<number, number>>({});
  const [scheduleDates, setScheduleDates] = useState<Record<number, string>>({});
  const [fulfillUnits, setFulfillUnits] = useState<Record<number, string>>({});
  const [fulfillNotes, setFulfillNotes] = useState<Record<number, string>>({});
  const [actionKeys, setActionKeys] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError('');
    try { setWorkspace(await getMobileWorkspace()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load requests.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const toggleComponent = (key: string) => setForm(current => ({
    ...current,
    bloodComponents: current.bloodComponents.includes(key)
      ? current.bloodComponents.filter(item => item !== key)
      : [...current.bloodComponents, key],
  }));

  const submitRequest = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await createMobileRequest({ ...form, submissionKey });
      setMessage(result.message || 'Request submitted.');
      setForm(initialForm()); setSubmissionKey(makeOperationKey()); setShowForm(false);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The request could not be submitted.'); }
    finally { setBusy(false); }
  };

  const act = async (item: MobileRequest, action: 'pledge' | 'withdraw' | 'approve' | 'decline' | 'cancel') => {
    setBusyRequest(item.id); setError(''); setMessage('');
    try {
      if (action === 'pledge') await pledgeMobileRequest(item.id);
      else if (action === 'withdraw') await withdrawMobilePledge(item.id);
      else if (action === 'approve') await reviewMobileRequest(item.id, 'approve');
      else if (action === 'decline') await reviewMobileRequest(item.id, 'decline', declineReasons[item.id] || 'Please provide updated request information.');
      else await cancelMobileRequest(item.id);
      setMessage(action === 'approve' ? 'Request approved for coordination.' : action === 'decline' ? 'Request returned to the requester.' : action === 'cancel' ? 'Request cancelled.' : action === 'pledge' ? 'Your offer has been recorded.' : 'Your offer was withdrawn.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'That action could not be completed.'); }
    finally { setBusyRequest(null); }
  };

  const schedule = async (item: MobileRequest) => {
    const donorId = selectedDonor[item.id];
    const scheduledDate = scheduleDates[item.id] || localDateTime(new Date(Date.now() + 86400000));
    if (!donorId) { setError('Select a donor to schedule this request.'); return; }
    const keyName = `schedule-${item.id}`;
    const key = actionKeys[keyName] || makeOperationKey();
    setActionKeys(current => ({ ...current, [keyName]: key }));
    setBusyRequest(item.id); setError(''); setMessage('');
    try {
      const result = await scheduleMobileRequest(item.id, { donorId, scheduledDate, notes: 'Scheduled from the VitalMatch mobile app', idempotencyKey: key });
      setActionKeys(current => { const next = { ...current }; delete next[keyName]; return next; });
      setSchedulePanel(null); setMessage(result.message); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The appointment could not be scheduled.'); }
    finally { setBusyRequest(null); }
  };

  const fulfill = async (item: MobileRequest) => {
    const keyName = `fulfill-${item.id}`;
    const key = actionKeys[keyName] || makeOperationKey();
    setActionKeys(current => ({ ...current, [keyName]: key }));
    setBusyRequest(item.id); setError(''); setMessage('');
    try {
      const body: Record<string, unknown> = { unitsProvided: fulfillUnits[item.id] || '1', notes: fulfillNotes[item.id] || '', idempotencyKey: key };
      if (item.status === 'scheduled') Object.assign(body, { appointmentId: item.appointmentId, version: item.appointmentVersion });
      const result = await fulfillMobileRequest(item.id, body);
      setActionKeys(current => { const next = { ...current }; delete next[keyName]; return next; });
      setFulfillPanel(null); setMessage(result.message); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The completion could not be recorded.'); }
    finally { setBusyRequest(null); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  const role = workspace?.account.role || 'user';
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}><Text style={styles.title}>Requests</Text><Text style={styles.subtitle}>{listDescription(role)}</Text></View>
        <Pressable style={styles.newButton} onPress={() => { setShowForm(current => !current); setError(''); }}><Text style={styles.newButtonText}>{showForm ? 'Close' : '+ New'}</Text></Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>New blood request</Text>
          <Text style={styles.helper}>Enter the details supplied by the care team. VitalMatch does not determine clinical suitability.</Text>
          <Field label="Patient name" value={form.patientName} onChange={v => update('patientName', v)} />
          <Field label="Patient age" value={form.patientAge} onChange={v => update('patientAge', v)} keyboardType="number-pad" />
          <Text style={styles.label}>Blood type</Text>
          <View style={styles.chips}>{bloodTypes.map(type => <Chip key={type} label={type} selected={form.bloodType === type} onPress={() => update('bloodType', type)} />)}</View>
          <Field label="Units needed (1–10)" value={form.unitsRequired} onChange={v => update('unitsRequired', v)} keyboardType="number-pad" />
          <Text style={styles.label}>Blood components</Text>
          <View style={styles.chips}>{components.map(([key, label]) => <Chip key={key} label={label} selected={form.bloodComponents.includes(key)} onPress={() => toggleComponent(key)} />)}</View>
          {form.bloodComponents.map(key => <Field key={key} label={`${components.find(item => item[0] === key)?.[1]} quantity`} value={String(form[`${key}Volume`] || '')} onChange={v => update(`${key}Volume`, v)} placeholder="e.g. 1 unit or 250 ml" />)}
          <Field label="Transfusion indication" value={form.indicationOfTransfusion} onChange={v => update('indicationOfTransfusion', v)} multiline />
          <Field label="Hospital or facility" value={form.hospitalName} onChange={v => update('hospitalName', v)} />
          <Field label="Facility address" value={form.hospitalAddress} onChange={v => update('hospitalAddress', v)} />
          <Field label="City or municipality" value={form.city} onChange={v => update('city', v)} />
          <Field label="Province" value={form.province} onChange={v => update('province', v)} />
          <Field label="Contact person" value={form.contactPerson} onChange={v => update('contactPerson', v)} />
          <Field label="Contact mobile number" value={form.contactNumber} onChange={v => update('contactNumber', v)} keyboardType="phone-pad" />
          <Field label="Contact email" value={form.email} onChange={v => update('email', v)} keyboardType="email-address" />
          <Text style={styles.label}>Urgency</Text>
          <View style={styles.chips}>{urgencies.map(value => <Chip key={value} label={value} selected={form.urgency === value} onPress={() => update('urgency', value)} />)}</View>
          <Field label="Required by (YYYY-MM-DD)" value={form.requiredByDate} onChange={v => update('requiredByDate', v)} />
          <Field label="Additional notes (optional)" value={form.notes} onChange={v => update('notes', v)} multiline />
          <Pressable style={styles.submitButton} disabled={busy} onPress={() => void submitRequest()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit request</Text>}</Pressable>
        </View>
      ) : null}

      {!showForm && !workspace?.requests.length ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{role === 'donor' ? (workspace?.donor ? 'No matching open requests' : 'Donor profile needed') : 'No requests yet'}</Text>
          <Text style={styles.emptyText}>{role === 'donor' && !workspace?.donor ? 'Complete a donor profile in VitalMatch before you can view matching requests or pledge.' : role === 'donor' ? 'New reviewed requests that match your blood type will appear here.' : 'Create a request to start coordinating with donors and facilities.'}</Text>
        </View>
      ) : null}

      {!showForm ? workspace?.requests.map(item => (
        <View key={item.id} style={styles.requestCard}>
          <View style={styles.requestTop}><Text style={styles.bloodType}>{item.bloodType}</Text><Text style={[styles.urgency, item.urgency === 'critical' && styles.critical]}>{item.isEmergency ? 'EMERGENCY' : item.urgency.toUpperCase()}</Text></View>
          <Text style={styles.facility}>{item.hospitalName}</Text>
          <Text style={styles.detail}>{item.city} · {item.unitsRemaining} unit(s) outstanding</Text>
          {item.patientName ? <Text style={styles.detail}>Patient: {item.patientName}</Text> : null}
          <Text style={styles.detail}>Needed by {new Date(item.requiredByDate).toLocaleDateString()}</Text>
          <View style={styles.statusRow}><Text style={styles.status}>{item.status.replaceAll('_', ' ')}</Text>{item.hospitalStatus ? <Text style={styles.reviewStatus}>{item.hospitalStatus.replaceAll('_', ' ')}</Text> : null}</View>

          {role === 'donor' && !item.isOwn && item.unitsRemaining > 0 ? <Pressable style={styles.actionButton} disabled={busyRequest === item.id} onPress={() => void act(item, item.hasPledged ? 'withdraw' : 'pledge')}><Text style={styles.actionText}>{item.hasPledged ? 'Withdraw offer' : 'Offer to donate'}</Text></Pressable> : null}
          {item.canReview ? (
            <View style={styles.reviewBox}>
              {item.hospitalStatus === 'pending' ? <Text style={styles.helper}>This request is waiting for facility review.</Text> : null}
              <Field label="Reason if returning this request" value={declineReasons[item.id] || ''} onChange={v => setDeclineReasons(current => ({ ...current, [item.id]: v }))} />
              <View style={styles.actions}><Pressable style={styles.actionButton} disabled={busyRequest === item.id} onPress={() => void act(item, 'approve')}><Text style={styles.actionText}>Approve</Text></Pressable><Pressable style={styles.declineButton} disabled={busyRequest === item.id} onPress={() => void act(item, 'decline')}><Text style={styles.declineText}>Return</Text></Pressable></View>
            </View>
          ) : null}
          {item.canCancel && ['active', 'pending', 'scheduled'].includes(item.status) ? <Pressable style={styles.cancelButton} onPress={() => Alert.alert('Cancel this request?', 'This will notify the coordination team and stop its current workflow.', [{ text: 'Keep request', style: 'cancel' }, { text: 'Cancel request', style: 'destructive', onPress: () => void act(item, 'cancel') }])}><Text style={styles.cancelText}>Cancel request</Text></Pressable> : null}
          {role === 'admin' && item.status === 'active' && item.unitsRemaining > 0 ? (
            <View style={styles.adminActions}>
              <View style={styles.actions}>
                <Pressable style={styles.adminButton} onPress={() => { setSchedulePanel(schedulePanel === item.id ? null : item.id); setFulfillPanel(null); if (!scheduleDates[item.id]) setScheduleDates(current => ({ ...current, [item.id]: localDateTime(new Date(Date.now() + 86400000)) })); }}><Text style={styles.adminButtonText}>Schedule donor</Text></Pressable>
                <Pressable style={styles.adminButton} onPress={() => { setFulfillPanel(fulfillPanel === item.id ? null : item.id); setSchedulePanel(null); if (!fulfillUnits[item.id]) setFulfillUnits(current => ({ ...current, [item.id]: '1' })); }}><Text style={styles.adminButtonText}>Record donation</Text></Pressable>
              </View>
              {schedulePanel === item.id ? <View style={styles.inlinePanel}>
                <Text style={styles.label}>Select a donor</Text>
                {workspace?.coordinationDonors.filter(donor => compatible(item.bloodType, donor.bloodType)).map(donor => <Pressable key={donor.id} style={[styles.donorOption, selectedDonor[item.id] === donor.id && styles.donorOptionActive]} onPress={() => setSelectedDonor(current => ({ ...current, [item.id]: donor.id }))}><Text style={styles.donorName}>{donor.fullName}</Text><Text style={styles.detail}>{donor.bloodType} · donor #{donor.id}</Text></Pressable>)}
                {!workspace?.coordinationDonors.some(donor => compatible(item.bloodType, donor.bloodType)) ? <Text style={styles.helper}>No matching available donor is listed. Assignment is checked again when you save.</Text> : null}
                <Field label="Appointment date and time" value={scheduleDates[item.id] || ''} onChange={v => setScheduleDates(current => ({ ...current, [item.id]: v }))} placeholder="YYYY-MM-DDTHH:mm" />
                <Pressable style={styles.actionButton} disabled={busyRequest === item.id} onPress={() => void schedule(item)}>{busyRequest === item.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Save appointment</Text>}</Pressable>
              </View> : null}
              {fulfillPanel === item.id ? <View style={styles.inlinePanel}>
                <Field label={`Units provided (up to ${item.unitsRemaining})`} value={fulfillUnits[item.id] || ''} onChange={v => setFulfillUnits(current => ({ ...current, [item.id]: v }))} keyboardType="number-pad" />
                <Field label="Completion note" value={fulfillNotes[item.id] || ''} onChange={v => setFulfillNotes(current => ({ ...current, [item.id]: v }))} multiline />
                <Pressable style={styles.actionButton} disabled={busyRequest === item.id} onPress={() => void fulfill(item)}>{busyRequest === item.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Record completion</Text>}</Pressable>
              </View> : null}
            </View>
          ) : null}
          {role === 'admin' && item.status === 'scheduled' && item.appointmentId && item.appointmentVersion && item.requesterConfirmed && item.donorConfirmed ? (
            <Pressable style={styles.actionButton} onPress={() => { setFulfillPanel(fulfillPanel === item.id ? null : item.id); if (!fulfillUnits[item.id]) setFulfillUnits(current => ({ ...current, [item.id]: '1' })); }}><Text style={styles.actionText}>{fulfillPanel === item.id ? 'Close completion' : 'Record confirmed donation'}</Text></Pressable>
          ) : null}
          {role === 'admin' && fulfillPanel === item.id && item.status === 'scheduled' ? <View style={styles.inlinePanel}><Field label={`Units provided (up to ${item.unitsRemaining})`} value={fulfillUnits[item.id] || ''} onChange={v => setFulfillUnits(current => ({ ...current, [item.id]: v }))} keyboardType="number-pad" /><Field label="Completion note" value={fulfillNotes[item.id] || ''} onChange={v => setFulfillNotes(current => ({ ...current, [item.id]: v }))} multiline /><Pressable style={styles.actionButton} disabled={busyRequest === item.id} onPress={() => void fulfill(item)}><Text style={styles.actionText}>Record completion</Text></Pressable></View> : null}
        </View>
      )) : null}
    </ScrollView>
  );
}

function listDescription(role: string) {
  return ({ user: 'Track requests created by your account.', donor: 'Review approved requests matching your donor blood type.', hospital: 'Review requests connected to your verified facility.', admin: 'Review open requests and urgent coordination work.' } as Record<string, string>)[role] || 'Coordinate blood requests.';
}

function compatible(recipient: string, donor: string) {
  const compatibleTypes: Record<string, string[]> = {
    'O-': ['O-'], 'O+': ['O-', 'O+'], 'A-': ['O-', 'A-'], 'A+': ['O-', 'O+', 'A-', 'A+'],
    'B-': ['O-', 'B-'], 'B+': ['O-', 'O+', 'B-', 'B+'],
    'AB-': ['O-', 'A-', 'B-', 'AB-'], 'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  };
  return compatibleTypes[recipient]?.includes(donor) || false;
}

function Field({ label, value, onChange, keyboardType, multiline, placeholder }: { label: string; value: string; onChange: (value: string) => void; keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad'; multiline?: boolean; placeholder?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType={keyboardType || 'default'} multiline={multiline} placeholder={placeholder} placeholderTextColor={colors.muted} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} style={[styles.input, multiline && styles.multiline]} /></View>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipActive]}><Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { padding: 17, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, headingCopy: { flex: 1, paddingRight: 8 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 3, fontSize: 13, lineHeight: 19 },
  newButton: { borderRadius: 10, backgroundColor: colors.brand, paddingHorizontal: 13, paddingVertical: 10 }, newButtonText: { color: '#fff', fontWeight: '800' },
  error: { color: colors.danger, marginBottom: 10, fontSize: 13 }, success: { color: colors.success, marginBottom: 10, fontSize: 13, fontWeight: '600' },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 18 }, emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 16 }, emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  requestCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 10 }, requestTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, bloodType: { color: colors.brand, fontSize: 20, fontWeight: '900' }, urgency: { fontSize: 10, fontWeight: '900', color: colors.warning, textTransform: 'uppercase' }, critical: { color: colors.danger }, facility: { color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 5 }, detail: { color: colors.muted, fontSize: 12, marginTop: 4 }, statusRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, status: { color: colors.text, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' }, reviewStatus: { color: colors.muted, fontSize: 11, textTransform: 'capitalize' },
  actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42, borderRadius: 9, backgroundColor: colors.brand, paddingHorizontal: 12, marginTop: 12 }, actionText: { color: '#fff', fontWeight: '800' }, actions: { flexDirection: 'row', gap: 8 }, declineButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42, borderRadius: 9, borderWidth: 1, borderColor: colors.border, marginTop: 12 }, declineText: { color: colors.text, fontWeight: '800' }, cancelButton: { paddingVertical: 10, alignItems: 'center' }, cancelText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  reviewBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }, helper: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  adminActions: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingTop: 5 }, adminButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginTop: 8 }, adminButtonText: { color: colors.text, fontWeight: '700', fontSize: 12 }, inlinePanel: { marginTop: 10, padding: 11, backgroundColor: colors.background, borderRadius: 9 }, donorOption: { padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 6, backgroundColor: '#fff' }, donorOptionActive: { borderColor: colors.brand, backgroundColor: '#fdecec' }, donorName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  formCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 15, marginBottom: 14 }, formTitle: { color: colors.text, fontSize: 18, fontWeight: '800' }, field: { marginTop: 10 }, label: { color: colors.text, fontWeight: '700', fontSize: 12, marginBottom: 5 }, input: { minHeight: 43, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 9, color: colors.text, fontSize: 14 }, multiline: { minHeight: 82, textAlignVertical: 'top' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 }, chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }, chipActive: { backgroundColor: '#fdecec', borderColor: colors.brand }, chipText: { fontSize: 12, color: colors.muted, fontWeight: '600' }, chipTextActive: { color: colors.brand }, submitButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, backgroundColor: colors.brand, borderRadius: 9, marginTop: 16 }, submitText: { color: '#fff', fontWeight: '800' },
});
