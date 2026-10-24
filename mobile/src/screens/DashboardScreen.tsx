import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getMobileWorkspace, markAllNotificationsRead, markNotificationRead } from '../api';
import type { MobileWorkspace } from '../api';
import { colors, radius } from '../theme';

export default function DashboardScreen() {
  const [workspace, setWorkspace] = useState<MobileWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setWorkspace(await getMobileWorkspace()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your workspace.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setWorkspace(current => current ? {
        ...current,
        notifications: current.notifications.map(item => item.id === id ? { ...item, isRead: true } : item),
        metrics: { ...current.metrics, unreadNotifications: Math.max(0, current.metrics.unreadNotifications - 1) },
      } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update the notification.'); }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setWorkspace(current => current ? {
        ...current,
        notifications: current.notifications.map(item => ({ ...item, isRead: true })),
        metrics: { ...current.metrics, unreadNotifications: 0 },
      } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update notifications.'); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!workspace) return <View style={styles.center}><Text style={styles.error}>{error || 'Workspace unavailable.'}</Text><Pressable onPress={() => { setLoading(true); void load(); }}><Text style={styles.retry}>Try again</Text></Pressable></View>;

  const { account, metrics, donor } = workspace;
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
    >
      <Text style={styles.eyebrow}>{roleName(account.role)} workspace</Text>
      <Text style={styles.title}>Hello, {account.firstName}</Text>
      <Text style={styles.subtitle}>{roleDescription(account.role)}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.grid}>
        {account.role === 'donor' ? <Stat label="Matching requests" value={metrics.requestCount} /> : null}
        {account.role === 'donor' && donor ? <Stat label="Blood type" value={donor.bloodType} /> : null}
        {account.role === 'user' ? <Stat label="My requests" value={metrics.requestCount} /> : null}
        {account.role === 'user' ? <Stat label="Pending review" value={metrics.pendingRequests} /> : null}
        {account.role === 'hospital' ? <Stat label="Facility requests" value={metrics.requestCount} /> : null}
        {account.role === 'hospital' ? <Stat label="Awaiting review" value={metrics.pendingReviews} /> : null}
        {account.role === 'admin' ? <Stat label="Open requests" value={metrics.requestCount} /> : null}
        {account.role === 'admin' ? <Stat label="Awaiting review" value={metrics.pendingReviews} /> : null}
        <Stat label="Appointments" value={metrics.appointments} />
        <Stat label="Unread updates" value={metrics.unreadNotifications} />
      </View>

      {account.role === 'donor' ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Donor availability</Text>
          <Text style={styles.noticeText}>{donor?.isAvailable ? 'Your availability preference is on.' : 'Your availability preference is off.'} Medical suitability is determined by authorized medical staff.</Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent updates</Text>
        {metrics.unreadNotifications > 0 ? <Pressable onPress={() => void markAllRead()}><Text style={styles.link}>Mark all read</Text></Pressable> : null}
      </View>
      {workspace.notifications.length === 0 ? <Text style={styles.empty}>No updates yet.</Text> : workspace.notifications.map(item => (
        <Pressable key={item.id} onPress={() => !item.isRead && void markRead(item.id)} style={[styles.notification, !item.isRead && styles.unread]}>
          <View style={styles.notificationTop}><Text style={styles.notificationTitle}>{item.title}</Text>{!item.isRead ? <Text style={styles.new}>NEW</Text> : null}</View>
          <Text style={styles.notificationBody}>{item.message}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function roleName(role: string) {
  return ({ user: 'Requester', donor: 'Donor', hospital: 'Hospital', admin: 'Administrator' } as Record<string, string>)[role] || 'VitalMatch';
}

function roleDescription(role: string) {
  return ({
    user: 'Track your requests and coordination updates.',
    donor: 'Review compatible requests and manage your appointments.',
    hospital: 'Review requests assigned to your verified facility.',
    admin: 'Monitor requests and coordinate system activity.',
  } as Record<string, string>)[role] || 'Your coordination updates.';
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 34 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  eyebrow: { color: colors.brand, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  title: { marginTop: 4, fontSize: 27, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, marginBottom: 18, color: colors.muted, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, marginBottom: 12, textAlign: 'center' },
  retry: { color: colors.brand, fontWeight: '700', marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.brand },
  statLabel: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: '600' },
  notice: { backgroundColor: '#fff8e8', borderColor: '#f4d38a', borderWidth: 1, borderRadius: radius.md, padding: 14, marginTop: 14 },
  noticeTitle: { color: colors.text, fontWeight: '800', marginBottom: 5 },
  noticeText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  link: { color: colors.brand, fontSize: 12, fontWeight: '700' },
  empty: { color: colors.muted, fontSize: 13 },
  notification: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13, marginBottom: 9 },
  unread: { borderLeftWidth: 3, borderLeftColor: colors.brand },
  notificationTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  notificationTitle: { flex: 1, fontWeight: '700', color: colors.text },
  new: { color: colors.brand, fontSize: 10, fontWeight: '800' },
  notificationBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  date: { color: colors.muted, fontSize: 11, marginTop: 7 },
});
