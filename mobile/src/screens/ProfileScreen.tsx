import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL } from '../config';
import { colors, radius } from '../theme';
import type { MobileAccount } from '../api';

interface Props {
  account: MobileAccount;
  busy: boolean;
  onSignOut: () => void;
}

export default function ProfileScreen({ account, busy, onSignOut }: Props) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Signed in to the coordination workspace</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>{account.firstName} {account.lastName}</Text>
        <Text style={styles.secondary}>{account.email}</Text>
        <Text style={styles.role}>{roleLabel(account.role)}</Text>
        {account.role === 'hospital' && account.hospitalName ? (
          <Text style={styles.secondary}>{account.hospitalName}</Text>
        ) : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Server</Text>
        <Text style={styles.value}>{API_BASE_URL}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onSignOut}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <Text style={styles.buttonText}>Sign out</Text>
        )}
      </Pressable>

      <Text style={styles.note}>
        Some web-only screens (live map, chat, calling) still open in the browser. Native versions
        need dedicated JSON endpoints before they can be added here.
      </Text>
    </ScrollView>
  );
}

function roleLabel(role: MobileAccount['role']) {
  return ({ user: 'Requester', donor: 'Donor', hospital: 'Hospital staff', admin: 'Administrator' })[role];
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 2, marginBottom: 16, color: colors.muted, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 3 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600' },
  secondary: { color: colors.muted, fontSize: 13, marginTop: 3 },
  role: { color: colors.brand, fontSize: 12, fontWeight: '700', marginTop: 8 },
  button: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: '#fdecec' },
  buttonText: { color: colors.brand, fontWeight: '700', fontSize: 15 },
  note: { marginTop: 18, color: colors.muted, fontSize: 12, lineHeight: 18 },
});
