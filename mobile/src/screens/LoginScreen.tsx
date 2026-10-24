import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, login } from '../api';
import type { MobileAccount } from '../api';
import { colors, radius } from '../theme';

interface Props {
  onSignedIn: (account: MobileAccount) => void;
  onRegister: () => void;
  onForgot: () => void;
  notice?: string;
}

export default function LoginScreen({ onSignedIn, onRegister, onForgot, notice }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      onSignedIn(await login(email.trim(), password));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to sign in. Check that the server is reachable.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>VitalMatch</Text>
        <Text style={styles.tagline}>Blood coordination workspace</Text>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
          placeholderTextColor={colors.muted}
          onSubmitEditing={() => void submit()}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => void submit()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>Use the account provided for your VitalMatch role.</Text>
        <Pressable style={styles.registerLink} onPress={onRegister}><Text style={styles.registerText}>Create a donor account</Text></Pressable>
        <Pressable style={styles.forgotLink} onPress={onForgot}><Text style={styles.forgotText}>Forgot password?</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.brand,
  },
  tagline: {
    marginTop: 2,
    marginBottom: 22,
    color: colors.muted,
    fontSize: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.brandDark,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  hint: {
    marginTop: 16,
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  notice: { color: colors.success, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  registerLink: { alignItems: 'center', paddingVertical: 12 },
  registerText: { color: colors.brand, fontSize: 14, fontWeight: '700' },
  forgotLink: { alignItems: 'center', paddingVertical: 4 },
  forgotText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
});
