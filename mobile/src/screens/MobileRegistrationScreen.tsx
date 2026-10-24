import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { registerDonor } from '../api';
import { colors, radius } from '../theme';

interface Props { onBack: () => void; onRegistered: (message: string) => void; }

export default function MobileRegistrationScreen({ onBack, onRegistered }: Props) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '', dateOfBirth: '', gender: '', address: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const result = await registerDonor({ ...form, role: 'donor' });
      onRegistered(result.message);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create your account.'); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back to sign in</Text></Pressable>
        <View style={styles.card}>
          <Text style={styles.brand}>Join VitalMatch</Text>
          <Text style={styles.subtitle}>Create a donor account. Hospital and administrator accounts are provided by system administrators.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Field label="First name" value={form.firstName} onChange={v => update('firstName', v)} />
          <Field label="Last name" value={form.lastName} onChange={v => update('lastName', v)} />
          <Field label="Email" value={form.email} onChange={v => update('email', v)} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Mobile number" value={form.phone} onChange={v => update('phone', v)} keyboardType="phone-pad" />
          <Field label="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChange={v => update('dateOfBirth', v)} />
          <Field label="Gender" value={form.gender} onChange={v => update('gender', v)} />
          <Field label="Full address" value={form.address} onChange={v => update('address', v)} multiline />
          <Field label="Password" value={form.password} onChange={v => update('password', v)} secureTextEntry />
          <Field label="Confirm password" value={form.confirmPassword} onChange={v => update('confirmPassword', v)} secureTextEntry />
          <Pressable style={styles.button} disabled={busy} onPress={() => void submit()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create donor account</Text>}</Pressable>
          <Text style={styles.footnote}>You’ll need to verify your email before signing in.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, keyboardType, autoCapitalize, secureTextEntry, multiline }: { label: string; value: string; onChange: (value: string) => void; keyboardType?: 'default' | 'email-address' | 'phone-pad'; autoCapitalize?: 'none' | 'sentences'; secureTextEntry?: boolean; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType={keyboardType || 'default'} autoCapitalize={autoCapitalize || 'sentences'} secureTextEntry={secureTextEntry} multiline={multiline} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  back: { paddingVertical: 9 }, backText: { color: colors.brand, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20 },
  brand: { color: colors.brand, fontSize: 25, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 8 },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 }, field: { marginTop: 10 }, label: { color: colors.text, fontWeight: '700', fontSize: 12, marginBottom: 5 },
  input: { minHeight: 43, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 9, color: colors.text, fontSize: 14 }, multiline: { minHeight: 72, textAlignVertical: 'top' },
  button: { minHeight: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.brand, marginTop: 17 }, buttonText: { color: '#fff', fontWeight: '800' }, footnote: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 13 },
});
