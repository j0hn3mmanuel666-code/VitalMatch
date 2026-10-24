import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { getMobileAccount, logout } from './src/api';
import type { MobileAccount } from './src/api';
import DashboardScreen from './src/screens/DashboardScreen';
import AppointmentsScreen from './src/screens/AppointmentsScreen';
import LoginScreen from './src/screens/LoginScreen';
import MobileRegistrationScreen from './src/screens/MobileRegistrationScreen';
import MobilePasswordResetScreen from './src/screens/MobilePasswordResetScreen';
import ProfileScreen from './src/screens/MobileProfileScreen';
import RequestsScreen from './src/screens/MobileRequestsScreen';
import { colors } from './src/theme';

const tabs = [
  { id: 'dashboard', label: 'Home' },
  { id: 'requests', label: 'Requests' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'profile', label: 'Profile' },
] as const;

type Tab = (typeof tabs)[number]['id'];

export default function App() {
  const [account, setAccount] = useState<MobileAccount | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [registerNotice, setRegisterNotice] = useState('');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    void getMobileAccount().then((current) => {
      if (active) setAccount(current);
    }).catch(() => {
      if (active) setAccount(null);
    }).finally(() => {
      if (active) setCheckingSession(false);
    });
    return () => { active = false; };
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      setAccount(null);
      setTab('dashboard');
    }
  };

  if (checkingSession) {
    return (
      <SafeAreaView style={[styles.root, styles.loading]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  if (!account) {
    if (showPasswordReset) {
      return <SafeAreaView style={styles.root}><StatusBar style="dark" /><MobilePasswordResetScreen onBack={() => setShowPasswordReset(false)} onSent={message => { setRegisterNotice(message); setShowPasswordReset(false); }} /></SafeAreaView>;
    }
    if (showRegister) {
      return <SafeAreaView style={styles.root}><StatusBar style="dark" /><MobileRegistrationScreen onBack={() => setShowRegister(false)} onRegistered={message => { setRegisterNotice(message); setShowRegister(false); }} /></SafeAreaView>;
    }
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <LoginScreen onSignedIn={setAccount} onRegister={() => { setRegisterNotice(''); setShowRegister(true); }} onForgot={() => { setRegisterNotice(''); setShowPasswordReset(true); }} notice={registerNotice} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.body}>
        {tab === 'dashboard' ? <DashboardScreen /> : null}
        {tab === 'requests' ? <RequestsScreen /> : null}
        {tab === 'appointments' ? <AppointmentsScreen role={account.role} /> : null}
        {tab === 'profile' ? (
          <ProfileScreen account={account} busy={signingOut} onSignOut={() => void signOut()} />
        ) : null}
      </View>
      <View style={styles.tabBar}>
        {tabs.map((item) => (
          <Pressable key={item.id} style={styles.tab} onPress={() => setTab(item.id)}>
            <Text style={[styles.tabLabel, tab === item.id && styles.tabLabelActive]}>
              {item.label}
            </Text>
            <View style={[styles.tabIndicator, tab === item.id && styles.tabIndicatorActive]} />
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingBottom: 6,
  },
  tab: { flex: 1, alignItems: 'center', paddingTop: 10 },
  tabLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  tabLabelActive: { color: colors.brand },
  tabIndicator: { height: 3, width: 26, borderRadius: 2, marginTop: 6, backgroundColor: 'transparent' },
  tabIndicatorActive: { backgroundColor: colors.brand },
});
