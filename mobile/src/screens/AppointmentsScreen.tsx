import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirmMobileAppointment, declineMobileAppointment, getMobileWorkspace } from '../api';
import type { MobileAppointment, AccountRole } from '../api';
import { colors, radius } from '../theme';

export default function AppointmentsScreen({ role }: { role: AccountRole }) {
  const [items, setItems] = useState<MobileAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setItems((await getMobileWorkspace()).appointments); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load appointments.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const confirm = async (item: MobileAppointment) => {
    setBusyId(item.id);
    try { await confirmMobileAppointment(item.id, item.version); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not confirm appointment.'); }
    finally { setBusyId(null); }
  };

  const decline = async (item: MobileAppointment) => {
    setBusyId(item.id);
    try { await declineMobileAppointment(item.id, item.version, 'Donor declined the appointment'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not decline appointment.'); }
    finally { setBusyId(null); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}>
      <Text style={styles.title}>Appointments</Text>
      <Text style={styles.subtitle}>Review the schedule and confirm when you are available.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!items.length ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No scheduled appointments</Text><Text style={styles.emptyText}>New appointments will appear here when coordination is complete.</Text></View> : null}
      {items.map(item => {
        const myRole = item.role === 'donor' || item.role === 'requester';
        const confirmed = item.role === 'donor' ? item.donorConfirmed : item.requesterConfirmed;
        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardTop}><Text style={styles.bloodType}>{item.bloodType}</Text><Text style={styles.units}>{item.unitsRemaining} unit(s) outstanding</Text></View>
            <Text style={styles.hospital}>{item.hospitalName}</Text>
            <Text style={styles.detail}>{item.city} · Request #{item.requestId}</Text>
            <Text style={styles.date}>{new Date(item.scheduledDate).toLocaleString()}</Text>
            {role === 'admin' || role === 'hospital' ? <Text style={styles.detail}>Donor: {item.donorName || 'Assigned donor'}</Text> : null}
            <View style={styles.confirmations}>
              <Text style={item.donorConfirmed ? styles.confirmed : styles.waiting}>Donor {item.donorConfirmed ? 'confirmed' : 'pending'}</Text>
              <Text style={item.requesterConfirmed ? styles.confirmed : styles.waiting}>Requester {item.requesterConfirmed ? 'confirmed' : 'pending'}</Text>
            </View>
            {myRole ? (
              confirmed ? <Text style={styles.confirmedNotice}>You have confirmed this appointment.</Text> : (
                <View style={styles.actions}>
                  <Pressable style={styles.primaryButton} onPress={() => void confirm(item)} disabled={busyId === item.id}>
                    {busyId === item.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Confirm</Text>}
                  </Pressable>
                  {item.role === 'donor' ? <Pressable style={styles.secondaryButton} onPress={() => Alert.alert('Decline appointment?', 'The coordinator will be notified and can arrange another donor.', [{ text: 'Keep appointment', style: 'cancel' }, { text: 'Decline', style: 'destructive', onPress: () => void decline(item) }])} disabled={busyId === item.id}><Text style={styles.secondaryText}>Decline</Text></Pressable> : null}
                </View>
              )
            ) : <Text style={styles.detail}>Only the assigned donor and requester can confirm.</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { fontSize: 25, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 3, marginBottom: 16, color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, marginBottom: 12 },
  emptyCard: { padding: 18, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 15, marginBottom: 11 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bloodType: { fontSize: 19, color: colors.brand, fontWeight: '800' },
  units: { color: colors.muted, fontSize: 12 },
  hospital: { marginTop: 6, color: colors.text, fontSize: 16, fontWeight: '700' },
  detail: { marginTop: 4, color: colors.muted, fontSize: 12 },
  date: { marginTop: 10, color: colors.text, fontWeight: '700' },
  confirmations: { flexDirection: 'row', gap: 12, marginTop: 12 },
  confirmed: { color: colors.success, fontSize: 12, fontWeight: '700' },
  waiting: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  confirmedNotice: { marginTop: 12, color: colors.success, fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  primaryButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.brand },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '700' },
});
