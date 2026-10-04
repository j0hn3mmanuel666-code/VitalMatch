export const canonicalRole = role => role === 'hospital_admin' ? 'hospital' : role;
export const isHospitalAccount = account => canonicalRole(account?.role) === 'hospital';
