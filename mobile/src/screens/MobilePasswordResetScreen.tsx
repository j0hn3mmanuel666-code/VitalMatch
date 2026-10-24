import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { requestMobilePasswordReset } from '../api';
import { colors, radius } from '../theme';

export default function MobilePasswordResetScreen({ onBack, onSent }: { onBack: () => void; onSent: (message: string) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!email.trim()) { setError('Enter the email address for your account.'); return; }
    setBusy(true); setError('');
    try { const result = await requestMobilePasswordReset(email.trim()); onSent(result.message); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not request a reset link.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.root}>
    <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back to sign in</Text></Pressable>
    <View style={styles.card}>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>Enter the account email. If it matches an active account, we’ll send reset instructions.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" placeholderTextColor={colors.muted} style={styles.input} />
      <Pressable style={styles.button} disabled={busy} onPress={() => void submit()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset link</Text>}</Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.background }, back: { paddingVertical: 10 }, backText: { color: colors.brand, fontWeight: '700' },
  card: { padding: 22, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }, title: { fontSize: 23, fontWeight: '800', color: colors.text }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 12 }, error: { color: colors.danger, fontSize: 13, marginBottom: 8 }, label: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }, input: { minHeight: 45, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, color: colors.text, backgroundColor: '#fff' }, button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, borderRadius: 8, marginTop: 15 }, buttonText: { color: '#fff', fontWeight: '800' },
});
