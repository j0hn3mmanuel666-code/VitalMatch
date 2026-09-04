import { Op } from "sequelize";
import { Donor } from "../models/donorModel.js";
import { Notification } from "../models/notificationModel.js";
import { emailService } from "./emailService.js";

const EARTH_RADIUS_KM = 6371;

const toRadians = value => value * Math.PI / 180;

export const calculateDistanceKm = (fromLatitude, fromLongitude, toLatitude, toLongitude) => {
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const latitude1 = toRadians(fromLatitude);
  const latitude2 = toRadians(toLatitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const hasCoordinates = location => location?.latitude !== null && location?.latitude !== undefined &&
  location?.longitude !== null && location?.longitude !== undefined &&
  location?.latitude !== '' && location?.longitude !== '' &&
  Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude));

export const findNearestDonors = async (request, limit = 10) => {
  const donorWhere = {
    bloodType: request.bloodType,
    isAvailable: true
  };

  if (request.userId) {
    donorWhere.userId = { [Op.ne]: request.userId };
  }

  const donors = await Donor.findAll({ where: donorWhere });
  const requestHasCoordinates = hasCoordinates(request);
  const requestCity = request.city?.trim().toLowerCase();
  const requestProvince = request.province?.trim().toLowerCase();

  return donors
    .map(donor => {
      const donorHasCoordinates = hasCoordinates(donor);
      const sameArea = donor.city?.trim().toLowerCase() === requestCity &&
        donor.province?.trim().toLowerCase() === requestProvince;
      const distanceKm = requestHasCoordinates && donorHasCoordinates
        ? calculateDistanceKm(request.latitude, request.longitude, donor.latitude, donor.longitude)
        : null;

      return { donor, distanceKm, sameArea };
    })
    .sort((first, second) => {
      if (first.distanceKm !== null && second.distanceKm !== null) {
        return first.distanceKm - second.distanceKm;
      }
      if (first.distanceKm !== null) return -1;
      if (second.distanceKm !== null) return 1;
      if (first.sameArea !== second.sameArea) return first.sameArea ? -1 : 1;
      return new Date(second.donor.createdAt) - new Date(first.donor.createdAt);
    })
    .slice(0, limit);
};

export const notifyNearestDonors = async request => {
  const matches = await findNearestDonors(request);

  await Promise.all(matches.map(async ({ donor, distanceKm }) => {
    const distanceText = distanceKm === null ? 'in your area' : `${distanceKm.toFixed(1)} km away`;

    try {
      if (donor.userId) {
        await Notification.create({
          userId: donor.userId,
          title: "Nearby Blood Request",
          message: `${request.bloodType} blood is needed at ${request.hospitalName}, ${distanceText}.`,
          type: "alert",
          link: `/view-blood-request/${request.id}`
        });
      }

      if (donor.email) {
        await emailService.sendNearbyRequestEmail(donor.email, donor.fullName, request, distanceText);
      }
    } catch (error) {
      console.error(`Failed to notify donor ${donor.id}:`, error);
    }
  }));

  if (matches.length > 0 && request.userId) {
    try {
      const nearestMatch = matches[0];
      const distanceText = nearestMatch.distanceKm === null
        ? 'in your area'
        : `${nearestMatch.distanceKm.toFixed(1)} km away`;

      await Notification.create({
        userId: request.userId,
        title: 'Nearby Donor Found',
        message: `A matching ${request.bloodType} donor was found ${distanceText} for your request at ${request.hospitalName}.`,
        type: 'success',
        link: `/view-blood-request/${request.id}`
      });
    } catch (error) {
      console.error(`Failed to notify requester for request ${request.id}:`, error);
    }
  }

  return matches;
};