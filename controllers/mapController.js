import { BloodRequest } from '../models/bloodRequestModel.js';
import { Donor } from '../models/donorModel.js';
import { User } from '../models/userModel.js';
import { Notification } from '../models/notificationModel.js';
import { RequestAccess } from '../models/requestAccessModel.js';
import { Op, fn, col, literal } from 'sequelize';
import { RED_CROSS_PINS, resolveCoords, normalizeCity } from '../services/mindoroGeo.js';
import { donationIntervalDays, donorAgeBounds } from '../services/coordinationPolicy.js';
export const mapPage = (req, res) => res.render('map', { title: 'Blood Map - VitalMatch' });
export const mapPins = async (req, res) => {
  try {
    const userId = req.session.userId, role = String(req.session.userRole || 'user').toLowerCase();
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const account = await User.findByPk(userId, { attributes: ['id','facilityId'] });
    const pins = { hospitals: [], requests: [], redcross: [], donors: [], donorCounts: [], self: null };
    const where = { status: 'active', hospitalStatus: 'approved', archivedAt: null };
    const totalRequests = await BloodRequest.count({ where });
    const requests = await BloodRequest.findAll({ where, attributes: ['id','userId','facilityId','latitude','longitude','city','province','hospitalName','unitsRequired','unitsFulfilled','bloodType','urgency','isEmergency','emergencyExpiresAt'],
      order: [[literal("CASE WHEN isEmergency = 1 AND emergencyExpiresAt > NOW() THEN 0 WHEN urgency = 'critical' THEN 1 WHEN urgency = 'urgent' THEN 2 ELSE 3 END"),'ASC'], ['createdAt','DESC']], limit: 100 });
    const ids = requests.map(r => r.id), allowed = new Set();
    if (ids.length && role !== 'admin') {
      const [notices, access] = await Promise.all([
        Notification.findAll({ where: { userId, link: ids.map(id => `/view-blood-request/${id}`) }, attributes: ['link'], raw: true }),
        RequestAccess.findAll({ where: { userId, requestId: ids, expiresAt: { [Op.gt]: new Date() } }, attributes: ['requestId'], raw: true })
      ]);
      for (const n of notices) allowed.add(Number(n.link.split('/').pop()));
      for (const a of access) allowed.add(a.requestId);
    }
    const hospitals = new Map();
    for (const r of requests) {
      const canViewDetails = role === 'admin' || r.userId === userId || (!!account?.facilityId && account.facilityId === r.facilityId && ['hospital','hospital_admin'].includes(role)) || allowed.has(r.id);
      const pos = canViewDetails ? resolveCoords(r.latitude,r.longitude,r.city) : resolveCoords(null,null,r.city);
      const emergencyActive = !!(r.isEmergency && r.emergencyExpiresAt && new Date(r.emergencyExpiresAt) > new Date());
      pins.requests.push({ id: r.id, bloodType: r.bloodType, units: Math.max(0,r.unitsRequired - (r.unitsFulfilled || 0)), urgency: emergencyActive ? 'emergency' : r.urgency, hospital: r.hospitalName, emergencyActive, city: r.city, ...pos,
        canViewDetails, approximate: !canViewDetails });
      const key = `${r.hospitalName}|${r.city}`;
      if (!hospitals.has(key)) hospitals.set(key, { name: r.hospitalName, city: r.city, province: r.province, ...resolveCoords(null,null,r.city), approximate:true, openRequests: 0 });
      hospitals.get(key).openRequests++;
    }
    pins.hospitals = [...hospitals.values()];
    pins.redcross = RED_CROSS_PINS.map(p => ({ name:p.name,address:p.address,phone:p.phone,lat:p.lat,lng:p.lng }));
    const include = [{ model: User, attributes: [], required: true, where: { isActive:true,emailVerified:true,archivedAt:null } }];
    const ages=donorAgeBounds();
    const donorWhere = { isAvailable:true,dateOfBirth:{[Op.gt]:ages.after,[Op.lte]:ages.through},[Op.and]:[
      {[Op.or]:[{lastDonationDate:null},{lastDonationDate:{[Op.lte]:new Date(Date.now()-donationIntervalDays()*86400000)}}]},
      literal("NOT EXISTS (SELECT 1 FROM Appointments occupied WHERE occupied.donorId = Donor.id AND occupied.status = 'scheduled')")
    ] };
    const totalDonors = await Donor.count({ where: donorWhere, include });
    if (['hospital','hospital_admin','admin'].includes(role)) {
      const donors = await Donor.findAll({ where: donorWhere, include, attributes: ['city','bloodType'], order:[['id','ASC']], limit:100 });
      pins.donors = donors.map(d => ({ bloodType:d.bloodType,city:d.city,...resolveCoords(null,null,d.city),approximate:true }));
    } else {
      const self = await Donor.findOne({ where: { userId } });
      if (self) pins.self = { bloodType:self.bloodType,city:self.city,...resolveCoords(self.latitude,self.longitude,self.city),isAvailable:self.isAvailable };
      const grouped = await Donor.findAll({ where: donorWhere, include, attributes: ['city','bloodType',[fn('COUNT',col('Donor.id')),'count']], group:['Donor.city','Donor.bloodType'], raw:true });
      const byCity = new Map();
      for (const d of grouped) {
        const key = normalizeCity(d.city) || 'unknown';
        if (!byCity.has(key)) byCity.set(key,{ city:d.city,count:0,types:{} });
        const entry = byCity.get(key); entry.count += Number(d.count); entry.types[d.bloodType] = (entry.types[d.bloodType] || 0)+Number(d.count);
      }
      pins.donorCounts = [...byCity.values()].map(d => ({ ...d,...resolveCoords(null,null,d.city) }));
    }
    res.json({ success:true,pins,limits:{ requests:{shown:pins.requests.length,total:totalRequests,limit:100},donors:{shown:pins.donors.length,total:totalDonors,limit:100} },requestOrder:'urgency then newest',hospitalCountsAreLimited: totalRequests > 100 });
  } catch { res.status(500).json({ success:false,message:'Map data could not be loaded. Please retry.' }); }
};
