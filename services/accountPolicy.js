export const canonicalRole = role => role === 'hospital_admin' ? 'hospital' : role;
export const isHospitalAccount = account => canonicalRole(account?.role) === 'hospital';
export const dashboardPathFor = account => {
  const role = canonicalRole(String(account?.role || '').toLowerCase());
  return role === 'admin' ? '/admin/dashboard' : role === 'hospital' ? '/hospital/dashboard' : '/dashboard';
};
