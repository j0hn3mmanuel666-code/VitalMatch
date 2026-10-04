import { Op } from 'sequelize';
import { sequelize } from '../models/db.js';
import { Donor } from '../models/donorModel.js';
import { User } from '../models/userModel.js';
import { UserSetting } from '../models/userSettingModel.js';
import { Appointment } from '../models/appointmentModel.js';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { RequestAccess } from '../models/requestAccessModel.js';
import { isCompatible } from '../models/pledgeModel.js';
import { donationIntervalDays, donorAgeBounds, unitsRemaining } from './coordinationPolicy.js';
import { queueEmail, queueNotification } from './outboxService.js';

export const calculateDistanceKm = (aLat, aLng, bLat, bLng) => {
  const radians = value => Number(value) * Math.PI / 180;
  const deltaLat = radians(bLat - aLat), deltaLng = radians(bLng - aLng);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
};
const hasCoordinates = item => item?.latitude !== null && item?.latitude !== undefined && item?.longitude !== null && item?.longitude !== undefined && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));

export async function findNearestDonors(request, limit = 10, excludeUserIds = []) {
  if (!request || request.status !== 'active' || request.hospitalStatus !== 'approved' || request.archivedAt) return [];
  const requestedLimit = Math.max(1, Math.min(1000, Number.parseInt(limit, 10) || 10));
  const types = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].filter(type => isCompatible(type, request.bloodType));
  const cutoff = new Date(Date.now() - donationIntervalDays() * 86400000);
  const ageBounds = donorAgeBounds();
  const where = { bloodType: types, isAvailable: true, dateOfBirth: { [Op.gt]: ageBounds.after, [Op.lte]: ageBounds.through }, [Op.or]: [{ lastDonationDate: null }, { lastDonationDate: { [Op.lte]: cutoff } }], [Op.and]: [sequelize.literal("NOT EXISTS (SELECT 1 FROM Appointments occupied WHERE occupied.donorId = Donor.id AND occupied.status = 'scheduled')")] };
  const excluded = [...new Set([request.userId, ...excludeUserIds].filter(id => Number.isInteger(Number(id)) && Number(id) > 0).map(Number))];
  if (excluded.length) where.userId = { [Op.notIn]: excluded };
  const city = sequelize.escape(String(request.city || '').trim().toLowerCase()), province = sequelize.escape(String(request.province || '').trim().toLowerCase());
  const sameArea = "CASE WHEN LOWER(TRIM(Donor.city)) = " + city + " AND LOWER(TRIM(Donor.province)) = " + province + " THEN 1 ELSE 0 END";
  const usableCoordinates = hasCoordinates(request) && Math.abs(Number(request.latitude)) <= 90 && Math.abs(Number(request.longitude)) <= 180;
  let distance = 'NULL', coordinateRank = '1';
  if (usableCoordinates) {
    const lat = Number(request.latitude), lng = Number(request.longitude);
    const donorCoordinates = 'Donor.latitude IS NOT NULL AND Donor.longitude IS NOT NULL AND ABS(Donor.latitude) <= 90 AND ABS(Donor.longitude) <= 180';
    distance = 'CASE WHEN ' + donorCoordinates + ' THEN 6371 * ACOS(LEAST(1, GREATEST(-1, SIN(RADIANS(' + lat + '))*SIN(RADIANS(Donor.latitude)) + COS(RADIANS(' + lat + '))*COS(RADIANS(Donor.latitude))*COS(RADIANS(Donor.longitude - ' + lng + '))))) ELSE NULL END';
    coordinateRank = 'CASE WHEN ' + donorCoordinates + ' THEN 0 ELSE 1 END';
  }
  const donors = await Donor.findAll({ where, include: [{ model: User, required: true, where: { isActive: true, emailVerified: true, archivedAt: null }, attributes: ['id','email'] }], attributes: { include: [[sequelize.literal(distance), 'matchDistanceKm'], [sequelize.literal(sameArea), 'matchSameArea']] }, order: [[sequelize.literal(coordinateRank),'ASC'], [sequelize.literal(distance),'ASC'], [sequelize.literal(sameArea),'DESC'], ['id','ASC']], limit: requestedLimit });
  return donors.map(donor => ({ donor, distanceKm: donor.get('matchDistanceKm') === null ? null : Number(donor.get('matchDistanceKm')), sameArea: Number(donor.get('matchSameArea')) === 1 }));
}

async function notifyMatches(request, emergency, excludeUserIds) {
  const matches = await findNearestDonors(request, emergency ? 1000 : 10, excludeUserIds);
  for (const { donor, distanceKm } of matches) {
    await sequelize.transaction(async transaction => {
      const current = await BloodRequest.findByPk(request.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!current || current.status !== 'active' || current.hospitalStatus !== 'approved' || current.archivedAt) return;
      const prefs = await UserSetting.findOne({ where: { userId: donor.userId }, transaction });
      const [access] = await RequestAccess.findOrCreate({ where: { requestId: current.id, userId: donor.userId }, defaults: { expiresAt: new Date(Date.now() + 30 * 86400000) }, transaction });
      await access.update({ expiresAt: new Date(Date.now() + 30 * 86400000) }, { transaction });
      const distanceText = distanceKm === null ? 'Distance has not been confirmed' : distanceKm.toFixed(1) + ' km away';
      if (!prefs || prefs.notifyMatches) await queueNotification({ userId: donor.userId, deliveryKey: 'match:' + current.id + ':' + current.version + ':' + donor.id + ':' + (emergency ? 'emergency' : 'normal'), title: emergency ? 'Urgent coordination request' : 'Blood request invitation', message: 'Request #' + current.id + ': ' + current.bloodType + ' blood requested at ' + current.hospitalName + '. ' + distanceText + '. A coordinator must confirm suitability.', type: emergency ? 'alert' : 'info', link: '/view-blood-request/' + current.id }, { transaction });
      if (!prefs || prefs.emailUpdates) await queueEmail({ kind: 'nearby-request', recipient: donor.User.email, dedupeKey: 'match:' + current.id + ':' + current.version + ':' + donor.id + ':' + (emergency ? 'emergency' : 'normal'), payload: { recipientName: donor.fullName, distanceText, request: { id: current.id, version: current.version, bloodType: current.bloodType, hospitalName: current.hospitalName, city: current.city, urgency: current.urgency, unitsRequired: current.unitsRequired, unitsRemaining: unitsRemaining(current) } } }, { transaction });
    });
  }
  return matches;
}
export async function notifyNearestDonors(request, { excludeUserIds = [] } = {}) { return notifyMatches(request, false, excludeUserIds); }
// Bounded to 1,000 invitations per escalation; staff can coordinate further batches.
export async function broadcastEmergency(request) { return (await notifyMatches(request, true, [])).length; }
