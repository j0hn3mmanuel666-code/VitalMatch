import { Facility } from '../models/facilityModel.js';

function validCoords(latitude, longitude) {
  const lat = latitude === undefined || latitude === null || latitude === '' ? null : Number(latitude);
  const lng = longitude === undefined || longitude === null || longitude === '' ? null : Number(longitude);
  if (lat === null && lng === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Facility coordinates must be a valid latitude (-90 to 90) and longitude (-180 to 180)');
  return { latitude: lat, longitude: lng };
}
// This helper is intentionally called only from administrator account management.
export async function resolveAdminFacility({ facilityId, hospitalName, adminId, latitude, longitude }, transaction) {
  const coords = validCoords(latitude, longitude);
  if (facilityId) {
    const facility = await Facility.findByPk(Number(facilityId), { transaction });
    if (!facility || !facility.isActive || !facility.verifiedAt) throw new Error('Select an active verified facility');
    if (coords && (facility.latitude !== coords.latitude || facility.longitude !== coords.longitude)) await facility.update(coords, { transaction });
    return facility;
  }
  const name = String(hospitalName || '').trim();
  if (name.length < 2 || name.length > 255) throw new Error('An official hospital name is required');
  const [facility] = await Facility.findOrCreate({ where: { hospitalName: name }, defaults: { hospitalName: name, verifiedAt: new Date(), verifiedBy: adminId, ...(coords || {}) }, transaction });
  if (!facility.isActive) throw new Error('This facility is inactive');
  if (!facility.verifiedAt) await facility.update({ verifiedAt: new Date(), verifiedBy: adminId }, { transaction });
  if (coords && (facility.latitude !== coords.latitude || facility.longitude !== coords.longitude)) await facility.update(coords, { transaction });
  return facility;
}
export async function listFacilities() {
  return (await Facility.findAll({ where: { isActive: true }, order: [['hospitalName', 'ASC']], attributes: ['id', 'hospitalName', 'verifiedAt'] })).filter(f => f.verifiedAt).map(f => ({ id: f.id, hospitalName: f.hospitalName }));
}
