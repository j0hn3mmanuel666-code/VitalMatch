export const DEMO_FACILITY_NAME = 'VitalMatch Demo Hospital (test data)';
export const DEMO_ADMIN_EMAIL = 'admin.demo@vitalmatch.test';
export const DEMO_HOSPITAL_EMAIL = 'hospital.demo@vitalmatch.test';
export const DEMO_ACCOUNT_DEFINITIONS = ['admin','hospital','donor','user'].map((role,index) => ({
  role, email: `${role}.demo@vitalmatch.test`, firstName: 'Demo',
  lastName: role.charAt(0).toUpperCase() + role.slice(1), phone: `0900000000${index + 1}`,
  address: 'Demo address (test data), Calapan City, Oriental Mindoro',
  dateOfBirth: '1995-01-15', gender: 'Male',
  hospitalName: role === 'hospital' ? DEMO_FACILITY_NAME : null,
  isActive: true, emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null
}));

export function assertLocalDemoEnvironment(env = process.env) {
  if (env.NODE_ENV === 'production' || !new Set(['localhost','127.0.0.1','::1']).has(env.DB_HOST || 'localhost') || !env.DB_NAME) {
    throw new Error('Demo fixture operations require an explicitly named local nonproduction database');
  }
}
export function matchesKnownDemoAccount(user, role) {
  const expected = DEMO_ACCOUNT_DEFINITIONS.find(definition => definition.role === role);
  if (!user || !expected || user.archivedAt || !user.isActive || !user.emailVerified) return false;
  if (user.role !== role && !(role === 'hospital' && user.role === 'hospital_admin')) return false;
  return ['email','firstName','lastName','phone','address','dateOfBirth','gender','hospitalName'].every(field => user[field] === expected[field]);
}
