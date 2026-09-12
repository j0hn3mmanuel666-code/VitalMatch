import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { RED_CROSS_PINS, resolveCoords, normalizeCity } from "../services/mindoroGeo.js";

// Render the map page
export const mapPage = (req, res) => {
  res.render("map", { title: "Blood Map - VitalMatch" });
};

// Role-filtered map pins as JSON
// - hospitals + requests + Red Cross: every logged-in user
// - donors: hospitals see approximate available-donor pins, donors see only their own pin,
//   regular users see per-city aggregate counts (no individual locations)
export const mapPins = async (req, res) => {
  try {
    const userId = req.session.userId;
    const role = (req.session.userRole || "user").toLowerCase();
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const pins = { hospitals: [], requests: [], redcross: [], donors: [], donorCounts: [], self: null };

    // Active requests drive both hospital pins and request pins
    const activeRequests = await BloodRequest.findAll({
      where: { status: "active" },
      order: [["createdAt", "DESC"]],
      limit: 50
    });

    const seenHospitals = new Map();
    for (const r of activeRequests) {
      const pos = resolveCoords(r.latitude, r.longitude, r.city);
      const emergencyActive = !!(
        r.isEmergency && r.emergencyExpiresAt &&
        new Date(r.emergencyExpiresAt) > new Date()
      );
      pins.requests.push({
        id: r.id,
        bloodType: r.bloodType,
        units: r.unitsRequired,
        urgency: emergencyActive ? "emergency" : r.urgency,
        hospital: r.hospitalName,
        emergencyActive,
        city: r.city,
        lat: pos.lat,
        lng: pos.lng,
        approximate: pos.approximate
      });
      const key = (r.hospitalName || "").toLowerCase() + "|" + (r.city || "").toLowerCase();
      if (!seenHospitals.has(key)) {
        seenHospitals.set(key, {
          name: r.hospitalName,
          city: r.city,
          province: r.province,
          lat: pos.lat,
          lng: pos.lng,
          approximate: pos.approximate,
          openRequests: 0
        });
      }
      seenHospitals.get(key).openRequests += 1;
    }
    pins.hospitals = Array.from(seenHospitals.values());

    // Red Cross chapters (static, public)
    pins.redcross = RED_CROSS_PINS.map(function (p) {
      return { name: p.name, address: p.address, phone: p.phone, lat: p.lat, lng: p.lng };
    });

    if (role === "hospital" || role === "hospital_admin" || role === "admin") {
      // Approximate pins only: city-center fallback, no names or contact details
      const donors = await Donor.findAll({ where: { isAvailable: true }, limit: 100 });
      pins.donors = donors.map(function (d) {
        const pos = resolveCoords(null, null, d.city);
        return { bloodType: d.bloodType, city: d.city, lat: pos.lat, lng: pos.lng, approximate: true };
      });
    } else {
      const self = await Donor.findOne({ where: { userId }, order: [["createdAt", "DESC"]] });
      if (self) {
        const pos = resolveCoords(self.latitude, self.longitude, self.city);
        pins.self = {
          bloodType: self.bloodType,
          city: self.city,
          lat: pos.lat,
          lng: pos.lng,
          approximate: pos.approximate,
          isAvailable: self.isAvailable
        };
      }
      // Aggregate counts per city for regular users (privacy-safe)
      const available = await Donor.findAll({ where: { isAvailable: true }, attributes: ["city", "bloodType"] });
      const byCity = new Map();
      for (const d of available) {
        const key = normalizeCity(d.city) || "unknown";
        if (!byCity.has(key)) byCity.set(key, { city: d.city, count: 0, types: {} });
        const entry = byCity.get(key);
        entry.count += 1;
        entry.types[d.bloodType] = (entry.types[d.bloodType] || 0) + 1;
      }
      pins.donorCounts = Array.from(byCity.values()).map(function (entry) {
        const pos = resolveCoords(null, null, entry.city);
        return { city: entry.city, count: entry.count, types: entry.types, lat: pos.lat, lng: pos.lng };
      });
    }

    res.json({ success: true, pins });
  } catch (error) {
    console.error("Map pins error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
