import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getMobilePushStatus, registerMobilePushDevice } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

async function getGrantedExpoPushToken(requestPermission: boolean) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Phone alerts are only available in the installed mobile app.');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('vitalmatch-updates', {
      name: 'VitalMatch updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#B91C1C',
      sound: 'default',
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    if (requestPermission) throw new Error('Allow notifications in your phone settings to receive VitalMatch alerts.');
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) throw new Error('Push alerts need an Expo project ID before this app can register your phone.');
  try { return (await Notifications.getExpoPushTokenAsync({ projectId })).data; }
  catch { throw new Error('Could not connect this phone to push alerts. Install a development build and check the Expo push setup.'); }
}

export async function enablePushOnDevice() {
  const token = await getGrantedExpoPushToken(true);
  if (!token) throw new Error('Allow notifications in your phone settings to receive VitalMatch alerts.');
  await registerMobilePushDevice(token, Platform.OS as 'android' | 'ios');
}

export async function refreshPushRegistrationIfEnabled() {
  const status = await getMobilePushStatus();
  if (!status.available || !status.enabled) return;
  const token = await getGrantedExpoPushToken(false);
  if (token) await registerMobilePushDevice(token, Platform.OS as 'android' | 'ios');
}
