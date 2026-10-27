import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { getMobileWorkspace, saveMobileDonorProfile, saveNotificationPreferences, submitMobileFeedback } from '../api';
import type { MobileAccount, MobileWorkspace } from '../api';
import { colors, radius } from '../theme';

interface Form {
  fullName: string; dateOfBirth: string; gender: string; bloodType: string; weight: string; height: string;
  mobileNumber: string; address: string; city: string; province: string; zipCode: string; latitude: string;
  longitude: string; lastDonationDate: string; medicalConditions: string; isAvailable: boolean;
  emergencyContactName: string; emergencyContactNumber: string; emergencyContactRelationship: string;
}
const emptyForm = (account: MobileAccount): Form => ({
  fullName: `${account.firstName} ${account.lastName}`,
  dateOfBirth: '', gender: '', bloodType: 'O+', weight: '', height: '', mobileNumber: '',
  address: '', city: '', province: 'Oriental Mindoro', zipCode: '', latitude: '', longitude: '',
  lastDonationDate: '', medicalConditions: '', isAvailable: false,
  emergencyContactName: '', emergencyContactNumber: '', emergencyContactRelationship: '',
});
const dateField = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 10) : '';

export default function MobileProfileScreen({ account, busy, onSignOut }: { account: MobileAccount; busy: boolean; onSignOut: () => void }) {
  const [form, setForm] = useState<Form>(() => emptyForm(account));
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preferences, setPreferences] = useState<MobileWorkspace['preferences']>({ notifyMatches: true, notifyAppointments: true, emailUpdates: true });
  const [preferencesError, setPreferencesError] = useState('');
  const [savingPreference, setSavingPreference] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackCategory, setFeedbackCategory] = useState('general');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

  useEffect(() => {
    let active = true;
    void getMobileWorkspace().then(workspace => {
      if (!active) return;
      setPreferences(workspace.preferences);
      const donor = workspace.donor;
      setHasProfile(!!donor);
      if (account.role === 'donor' && donor) setForm({
        fullName: donor.fullName || '', dateOfBirth: dateField(donor.dateOfBirth), gender: donor.gender || '',
        bloodType: donor.bloodType || 'O+', weight: String(donor.weight || ''), height: String(donor.height || ''),
        mobileNumber: donor.mobileNumber || '', address: donor.address || '', city: donor.city || '',
        province: donor.province || 'Oriental Mindoro', zipCode: donor.zipCode || '',
        latitude: donor.latitude == null ? '' : String(donor.latitude), longitude: donor.longitude == null ? '' : String(donor.longitude),
        lastDonationDate: dateField(donor.lastDonationDate), medicalConditions: donor.medicalConditions || '',
        isAvailable: !!donor.isAvailable, emergencyContactName: donor.emergencyContactName || '',
        emergencyContactNumber: donor.emergencyContactNumber || '', emergencyContactRelationship: donor.emergencyContactRelationship || '',
      });
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load your donor profile.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account]);

  const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const save = async () => {
    setError(''); setMessage(''); setSaving(true);
    try {
      const body = { ...form, isAvailable: form.isAvailable ? 'on' : 'off' };
      const result = await saveMobileDonorProfile(body);
      setHasProfile(true); setMessage(result.message);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save your donor profile.'); }
    finally { setSaving(false); }
  };

  const setPreference = async (key: keyof MobileWorkspace['preferences'], value: boolean) => {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next); setPreferencesError(''); setSavingPreference(true);
    try { await saveNotificationPreferences(next); }
    catch (caught) {
      setPreferences(previous);
      setPreferencesError(caught instanceof Error ? caught.message : 'Could not save preferences.');
    } finally { setSavingPreference(false); }
  };

  const sendFeedback = async () => {
    setFeedbackError(''); setFeedbackMessage(''); setSendingFeedback(true);
    try {
      const result = await submitMobileFeedback({ rating: feedbackRating, category: feedbackCategory, comment: feedbackComment });
      setFeedbackComment(''); setFeedbackMessage(result.message);
    } catch (caught) { setFeedbackError(caught instanceof Error ? caught.message : 'Could not send your feedback.'); }
    finally { setSendingFeedback(false); }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Account details and preferences</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>{account.firstName} {account.lastName}</Text>
        <Text style={styles.secondary}>{account.email}</Text>
        <Text style={styles.role}>{roleName(account.role)}</Text>
        {account.role === 'hospital' && account.hospitalName ? <Text style={styles.secondary}>{account.hospitalName}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Notification preferences</Text>
        <Text style={styles.note}>Choose which coordination updates VitalMatch sends to this account.</Text>
        {account.role !== 'donor' && error ? <Text style={styles.error}>{error}</Text> : null}
        {preferencesError ? <Text style={styles.error}>{preferencesError}</Text> : null}
        <PreferenceRow label="Request and donor matches" value={preferences.notifyMatches} disabled={savingPreference || loading} onChange={value => void setPreference('notifyMatches', value)} />
        <PreferenceRow label="Appointment updates" value={preferences.notifyAppointments} disabled={savingPreference || loading} onChange={value => void setPreference('notifyAppointments', value)} />
        <PreferenceRow label="Email updates" value={preferences.emailUpdates} disabled={savingPreference || loading} onChange={value => void setPreference('emailUpdates', value)} />
      </View>

      {account.role === 'donor' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{hasProfile ? 'Donor profile' : 'Create donor profile'}</Text>
          <Text style={styles.note}>Your profile helps coordinators match requests. Medical suitability is decided by authorized medical staff.</Text>
          {loading ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            <Field label="Full name" value={form.fullName} onChange={v => update('fullName', v)} />
            <Field label="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChange={v => update('dateOfBirth', v)} />
            <Field label="Gender" value={form.gender} onChange={v => update('gender', v)} />
            <Text style={styles.label}>Blood type</Text>
            <View style={styles.chips}>{['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map(type => <Pressable key={type} style={[styles.chip, form.bloodType === type && styles.chipActive]} onPress={() => update('bloodType', type)}><Text style={[styles.chipText, form.bloodType === type && styles.chipTextActive]}>{type}</Text></Pressable>)}</View>
            <Field label="Weight (kg)" value={form.weight} onChange={v => update('weight', v)} keyboardType="number-pad" />
            <Field label="Height (cm)" value={form.height} onChange={v => update('height', v)} keyboardType="number-pad" />
            <Field label="Mobile number" value={form.mobileNumber} onChange={v => update('mobileNumber', v)} keyboardType="phone-pad" />
            <Field label="Address" value={form.address} onChange={v => update('address', v)} />
            <Field label="City or municipality" value={form.city} onChange={v => update('city', v)} />
            <Field label="Province" value={form.province} onChange={v => update('province', v)} />
            <Field label="ZIP code" value={form.zipCode} onChange={v => update('zipCode', v)} keyboardType="number-pad" />
            <Field label="Last donation date (optional, YYYY-MM-DD)" value={form.lastDonationDate} onChange={v => update('lastDonationDate', v)} />
            <Field label="Emergency contact name" value={form.emergencyContactName} onChange={v => update('emergencyContactName', v)} />
            <Field label="Emergency contact number" value={form.emergencyContactNumber} onChange={v => update('emergencyContactNumber', v)} keyboardType="phone-pad" />
            <Field label="Relationship to emergency contact" value={form.emergencyContactRelationship} onChange={v => update('emergencyContactRelationship', v)} />
            <Field label="Medical conditions to share with staff (optional)" value={form.medicalConditions} onChange={v => update('medicalConditions', v)} multiline />
            <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.value}>Show availability preference</Text><Text style={styles.secondary}>This preference does not establish medical eligibility.</Text></View><Switch value={form.isAvailable} onValueChange={value => setForm(current => ({ ...current, isAvailable: value }))} trackColor={{ true: colors.brand }} /></View>
            <Pressable style={styles.saveButton} disabled={saving} onPress={() => void save()}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{hasProfile ? 'Save donor profile' : 'Create donor profile'}</Text>}</Pressable>
          </>}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Review VitalMatch</Text>
        <Text style={styles.note}>Your feedback is sent privately to the administrators and helps improve the system for every role.</Text>
        {feedbackError ? <Text style={styles.error}>{feedbackError}</Text> : null}
        {feedbackMessage ? <Text style={styles.success}>{feedbackMessage}</Text> : null}
        <Text style={styles.label}>Overall rating</Text>
        <View style={styles.feedbackRow}>
          {[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Rate ${value} out of 5 stars`} onPress={() => setFeedbackRating(value)} style={[styles.starButton, value <= feedbackRating && styles.starButtonActive]}><Text style={[styles.starText, value <= feedbackRating && styles.starTextActive]}>★</Text></Pressable>)}
        </View>
        <Text style={styles.label}>Feedback type</Text>
        <View style={styles.chips}>{[['general', 'General'], ['ease_of_use', 'Ease of use'], ['accessibility', 'Accessibility'], ['bug', 'Problem'], ['feature', 'Idea']].map(([value, label]) => <Pressable key={value} style={[styles.chip, feedbackCategory === value && styles.chipActive]} onPress={() => setFeedbackCategory(value)}><Text style={[styles.chipText, feedbackCategory === value && styles.chipTextActive]}>{label}</Text></Pressable>)}</View>
        <Field label="Comment (optional)" value={feedbackComment} onChange={setFeedbackComment} multiline />
        <Text style={styles.note}>Please do not include patient names or private medical details.</Text>
        <Pressable style={styles.saveButton} disabled={sendingFeedback} onPress={() => void sendFeedback()}>{sendingFeedback ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Send feedback</Text>}</Pressable>
      </View>

      <Pressable style={styles.signOut} onPress={onSignOut} disabled={busy}>{busy ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.signOutText}>Sign out</Text>}</Pressable>
    </ScrollView>
  );
}

function roleName(role: string) { return ({ user: 'Requester', donor: 'Donor', hospital: 'Hospital staff', admin: 'Administrator' } as Record<string, string>)[role] || 'Account'; }
function Field({ label, value, onChange, keyboardType, multiline }: { label: string; value: string; onChange: (value: string) => void; keyboardType?: 'default' | 'number-pad' | 'phone-pad'; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType={keyboardType || 'default'} multiline={multiline} autoCapitalize="sentences" placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.multiline]} /></View>;
}
function PreferenceRow({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.preferenceRow}><Text style={styles.preferenceLabel}>{label}</Text><Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.brand }} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { padding: 18, paddingBottom: 32 },
  title: { fontSize: 25, fontWeight: '800', color: colors.text }, subtitle: { marginTop: 3, marginBottom: 15, color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 15, marginBottom: 11 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 4 }, value: { color: colors.text, fontSize: 15, fontWeight: '700' }, secondary: { color: colors.muted, fontSize: 13, marginTop: 4 }, role: { color: colors.brand, fontSize: 12, fontWeight: '800', marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 8 }, loader: { margin: 20 }, error: { color: colors.danger, marginVertical: 8, fontSize: 13 }, success: { color: colors.success, marginVertical: 8, fontSize: 13, fontWeight: '700' },
  field: { marginTop: 10 }, input: { minHeight: 43, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 9, color: colors.text, fontSize: 14 }, multiline: { minHeight: 75, textAlignVertical: 'top' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 5 }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 }, chipActive: { borderColor: colors.brand, backgroundColor: '#fdecec' }, chipText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, chipTextActive: { color: colors.brand },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16, paddingTop: 13 }, switchCopy: { flex: 1, paddingRight: 10 }, saveButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, borderRadius: 9, marginTop: 16 }, saveText: { color: '#fff', fontWeight: '800' }, signOut: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.brand, borderRadius: 9, marginTop: 8 }, signOutText: { color: colors.brand, fontWeight: '800' },
  feedbackRow: { flexDirection: 'row', gap: 8, marginVertical: 8 }, starButton: { width: 42, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border }, starButtonActive: { borderColor: colors.brand, backgroundColor: '#fdecec' }, starText: { fontSize: 22, color: colors.border }, starTextActive: { color: colors.brand },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 }, preferenceLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600', marginRight: 10 },
});
