import { API_BASE_URL } from './config';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let csrfToken = '';

function extractCsrf(html: string): string {
  return (
    html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1] ??
    html.match(/name="_csrf"\s+value="([^"]+)"/)?.[1] ??
    ''
  );
}

export async function refreshCsrf(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/login`, { credentials: 'include' });
  csrfToken = extractCsrf(await response.text());
  return csrfToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.method && init.method !== 'GET') {
    if (!csrfToken) await refreshCsrf();
    headers.set('X-CSRF-Token', csrfToken);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (response.status === 401) throw new ApiError('Please sign in again', 401);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = body;
    try {
      const payload = JSON.parse(body);
      message = payload.error || payload.message || body;
    } catch { /* retain the response text */ }
    throw new ApiError(message || `Request failed (${response.status})`, response.status);
  }
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('Unexpected response from the server', response.status);
  }
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  type?: string;
  link?: string | null;
  createdAt: string;
}

export interface BlockchainStats {
  totalBlocks: number;
  pendingTransactions: number;
  donations: number;
  requests: number;
  fulfillments: number;
  isValid: boolean;
  mode: string;
}

export interface SearchResult {
  type: string;
  title: string;
  subtitle: string;
  url: string;
  status?: string;
}

export type AccountRole = 'user' | 'donor' | 'hospital' | 'admin';

export interface MobileAccount {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: AccountRole;
  hospitalName: string | null;
  facilityId: number | null;
}

export interface MobileRequest {
  id: number;
  isOwn: boolean;
  patientName: string | null;
  bloodType: string;
  unitsRequired: number;
  unitsFulfilled: number;
  unitsRemaining: number;
  hospitalName: string;
  city: string;
  urgency: string;
  requiredByDate: string;
  status: string;
  hospitalStatus: string;
  facilityId: number | null;
  isEmergency: boolean;
  scheduledDate: string | null;
  requesterConfirmed: boolean;
  donorConfirmed: boolean;
  version: number;
  hasPledged: boolean;
  canReview: boolean;
  canCancel: boolean;
  appointmentId?: number;
  appointmentVersion?: number;
}

export interface MobileAppointment {
  id: number;
  requestId: number;
  version: number;
  scheduledDate: string;
  donorConfirmed: boolean;
  requesterConfirmed: boolean;
  role: string;
  bloodType: string;
  unitsRemaining: number;
  hospitalName: string;
  city: string;
  donorName: string | null;
}

export interface MobileWorkspace {
  account: MobileAccount;
  donor: MobileDonorProfile | null;
  metrics: {
    requestCount: number;
    pendingRequests: number;
    activeRequests: number;
    pendingReviews: number;
    appointments: number;
    unreadNotifications: number;
  };
  requests: MobileRequest[];
  appointments: MobileAppointment[];
  notifications: NotificationItem[];
  coordinationDonors: { id: number; fullName: string; bloodType: string }[];
  preferences: { notifyMatches: boolean; notifyAppointments: boolean; emailUpdates: boolean };
}

export interface MobileDonorProfile {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  bloodType: string;
  weight: number;
  height: number;
  mobileNumber: string;
  address: string;
  city: string;
  province: string;
  zipCode: string;
  latitude: number | null;
  longitude: number | null;
  lastDonationDate: string | null;
  medicalConditions: string | null;
  isAvailable: boolean;
  emergencyContactName: string;
  emergencyContactNumber: string;
  emergencyContactRelationship: string;
}

export async function getMobileAccount(): Promise<MobileAccount> {
  const payload = await request<{ success: boolean; account: MobileAccount }>('/api/mobile/session');
  return payload.account;
}

export async function getMobileWorkspace(): Promise<MobileWorkspace> {
  const payload = await request<{ success: boolean } & MobileWorkspace>('/api/mobile/workspace');
  return payload;
}

async function postMobile<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export const createMobileRequest = (body: Record<string, unknown>) => postMobile<{ success: boolean; message: string }>('/api/mobile/requests', body);
export const pledgeMobileRequest = (id: number) => postMobile(`/api/mobile/requests/${id}/pledge`);
export const withdrawMobilePledge = (id: number) => postMobile(`/api/mobile/requests/${id}/pledge/withdraw`);
export const cancelMobileRequest = (id: number) => postMobile(`/api/mobile/requests/${id}/cancel`);
export const reviewMobileRequest = (id: number, action: 'approve' | 'decline', reason = '') => postMobile(`/api/mobile/requests/${id}/review`, { action, reason });
export const confirmMobileAppointment = (id: number, version: number) => postMobile(`/api/mobile/appointments/${id}/confirm`, { version });
export const declineMobileAppointment = (id: number, version: number, reason: string) => postMobile(`/api/mobile/appointments/${id}/decline`, { version, reason });
export const scheduleMobileRequest = (id: number, body: Record<string, unknown>) => postMobile<{ success: boolean; message: string }>(`/api/mobile/requests/${id}/schedule`, body);
export const fulfillMobileRequest = (id: number, body: Record<string, unknown>) => postMobile<{ success: boolean; message: string }>(`/api/mobile/requests/${id}/fulfill`, body);
export const markNotificationRead = (id: number) => postMobile(`/api/notifications/${id}/read`);
export const markAllNotificationsRead = () => postMobile('/api/notifications/read-all');
export const saveMobileDonorProfile = (body: Record<string, unknown>) => postMobile<{ success: boolean; message: string }>('/api/mobile/donor-profile', body);
export const saveNotificationPreferences = (preferences: { notifyMatches: boolean; notifyAppointments: boolean; emailUpdates: boolean }) => postMobile<{ success: boolean; preferences: MobileWorkspace['preferences']; message: string }>('/api/mobile/notification-settings', Object.fromEntries(Object.entries(preferences).map(([key, value]) => [key, value ? 'on' : 'off'])));
export const registerDonor = (body: Record<string, unknown>) => postMobile<{ success: boolean; message: string; email?: string }>('/api/mobile/register', body);
export const requestMobilePasswordReset = (email: string) => postMobile<{ success: boolean; message: string }>('/api/mobile/password-reset', { email });

export async function login(email: string, password: string): Promise<MobileAccount> {
  const token = await refreshCsrf();
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: token, email, password }).toString(),
    credentials: 'include',
  });
  if (response.status === 401) throw new ApiError('Invalid email or password', 401);
  if (response.status === 403) throw new ApiError('This account needs attention before it can sign in. Check your email verification or account status.', 403);
  if (!response.ok) throw new ApiError('Unable to sign in. Please try again.', response.status);
  const account = await getMobileAccount();
  await refreshCsrf();
  return account;
}

export async function logout(): Promise<void> {
  try {
    if (!csrfToken) await refreshCsrf();
    await fetch(`${API_BASE_URL}/logout`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      credentials: 'include',
    });
  } finally {
    csrfToken = '';
  }
}

export async function getNotifications() {
  return request<{ success: boolean; notifications: NotificationItem[]; unreadCount: number }>(
    '/api/notifications',
  );
}

export async function getBlockchainStats() {
  return request<{ success: boolean; data: BlockchainStats }>('/api/blockchain/stats');
}

export async function searchRequests(query: string) {
  return request<{ success: boolean; results: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(query)}`,
  );
}
