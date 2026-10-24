import { NativeModules, Platform } from 'react-native';

// Expo Go and simulator builds expose the Metro bundle URL. Its hostname is
// also the host computer's reachable address for a physical phone on Wi-Fi.
function getExpoHost() {
  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (!scriptURL) return null;

  try {
    return new URL(scriptURL).hostname;
  } catch {
    return null;
  }
}

const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const expoHost = getExpoHost();
const fallbackUrl = Platform.OS === 'ios' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

export const API_BASE_URL = (configuredUrl || (expoHost ? `http://${expoHost}:3000` : fallbackUrl)).replace(/\/+$/, '');
