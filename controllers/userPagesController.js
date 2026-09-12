import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { RED_CROSS_PINS } from "../services/mindoroGeo.js";

// Donation + request history for the logged-in user
export const historyPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    const requests = await BloodRequest.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]]
    });
    const donor = await Donor.findOne({ where: { userId }, order: [["createdAt", "DESC"]] });
    let donations = [];
    if (donor) {
      donations = await BloodRequest.findAll({
        where: { assignedDonorId: donor.id, status: "fulfilled" },
        order: [["updatedAt", "DESC"]]
      });
    }
    const fulfilledCount = requests.filter(function (r) { return r.status === "fulfilled"; }).length;
    res.render("history", {
      title: "History - VitalMatch",
      requests,
      donations,
      summary: {
        totalRequests: requests.length,
        fulfilledRequests: fulfilledCount,
        totalDonations: donations.length,
        livesImpacted: donations.length * 2
      }
    });
  } catch (error) {
    console.error("History page error:", error);
    req.flash("error_msg", "Could not load history");
    res.redirect("/dashboard");
  }
};

// Help and support page (FAQ + Red Cross contact)
export const helpPage = (req, res) => {
  res.render("help", {
    title: "Help and Support - VitalMatch",
    chapters: RED_CROSS_PINS
  });
};
