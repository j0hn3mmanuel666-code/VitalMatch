import { Facility } from '../models/facilityModel.js';

// This helper is intentionally called only from administrator account management.
export async function resolveAdminFacility({ facilityId, hospitalName, adminId }, transaction) {
  if (facilityId) {
    const facility = await Facility.findByPk(Number(facilityId), { transaction });
    if (!facility || !facility.isActive || !facility.verifiedAt) throw new Error('Select an active verified facility');
    return facility;
  }
  const name = String(hospitalName || '').trim();
  if (name.length < 2 || name.length > 255) throw new Error('An official hospital name is required');
  const [facility] = await Facility.findOrCreate({ where: { hospitalName: name }, defaults: { hospitalName: name, verifiedAt: new Date(), verifiedBy: adminId }, transaction });
  if (!facility.isActive) throw new Error('This facility is inactive');
  if (!facility.verifiedAt) await facility.update({ verifiedAt: new Date(), verifiedBy: adminId }, { transaction });
  return facility;
}
export async function listFacilities() {
  return (await Facility.findAll({ where: { isActive: true }, order: [['hospitalName', 'ASC']], attributes: ['id', 'hospitalName', 'verifiedAt'] })).filter(f => f.verifiedAt).map(f => ({ id: f.id, hospitalName: f.hospitalName }));
}
