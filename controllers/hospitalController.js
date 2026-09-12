import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { Pledge } from "../models/pledgeModel.js";
import { User } from "../models/userModel.js";
import { Notification } from "../models/notificationModel.js";
import { sequelize } from "../models/db.js";
import { Op } from "sequelize";

// Hospital patient records: own submissions plus requests this facility
// approved, with pledge counts and assigned-donor names for scheduled ones.
export const patientRecordsPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    const account = await User.findByPk(userId);
    const requests = await BloodRequest.findAll({
      where: {
        [Op.or]: [{ userId }, { hospitalId: userId }]
      },
      order: [["createdAt", "DESC"]]
    });

    // Inbox: requests naming this facility that still need review
    let pendingReview = [];
    const facilityName = (account?.hospitalName || "").trim().toLowerCase();
    if (facilityName) {
      pendingReview = await BloodRequest.findAll({
        where: {
          hospitalStatus: "pending",
          userId: { [Op.ne]: userId },
          [Op.and]: [sequelize.where(sequelize.fn("LOWER", sequelize.col("hospitalName")), facilityName)]
        },
        order: [["createdAt", "DESC"]]
      });
    }

    const ids = requests.map(function (r) { return r.id; });
    const pledgeCounts = {};
    if (ids.length > 0) {
      const rows = await Pledge.findAll({
        attributes: ["requestId", [sequelize.fn("COUNT", sequelize.col("id")), "cnt"]],
        where: { requestId: ids },
        group: ["requestId"],
        raw: true
      });
      rows.forEach(function (r) { pledgeCounts[r.requestId] = parseInt(r.cnt, 10); });
    }

    const donorIds = [...new Set(requests.map(function (r) { return r.assignedDonorId; }).filter(Boolean))];
    const donorNames = {};
    if (donorIds.length > 0) {
      const donors = await Donor.findAll({ where: { id: donorIds }, attributes: ["id", "fullName", "bloodType"] });
      donors.forEach(function (d) { donorNames[d.id] = d.fullName + " (" + d.bloodType + ")"; });
    }

    const records = requests.map(function (r) {
      const data = r.toJSON();
      data.pledgeCount = pledgeCounts[data.id] || 0;
      data.donorName = data.assignedDonorId ? (donorNames[data.assignedDonorId] || "Unknown donor") : null;
      return data;
    });

    const summary = {
      total: records.length,
      active: records.filter(function (r) { return r.status === "active"; }).length,
      scheduled: records.filter(function (r) { return r.status === "scheduled"; }).length,
      fulfilled: records.filter(function (r) { return r.status === "fulfilled"; }).length
    };

    res.render("hospital-patients", {
      title: "Patient Records - VitalMatch",
      records,
      summary,
      facilityName: account?.hospitalName || null,
      pendingReview
    });
  } catch (error) {
    console.error("Patient records error:", error);
    req.flash("error_msg", "Could not load patient records");
    res.redirect("/hospital/dashboard");
  }
};

// Approve a pending request as really belonging to this facility
export const approveRequest = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    const facilityName = (account?.hospitalName || "").trim().toLowerCase();
    const request = await BloodRequest.findByPk(req.params.id);
    if (!request || !facilityName ||
        (request.hospitalName || "").trim().toLowerCase() !== facilityName ||
        request.hospitalStatus !== "pending") {
      req.flash("error_msg", "Request not available for review");
      return res.redirect("/hospital/patients");
    }
    await request.update({ hospitalId: account.id, hospitalStatus: "approved" });
    req.flash("success_msg", `Request #${request.id} confirmed as your patient`);
    res.redirect("/hospital/patients");
  } catch (error) {
    console.error("Approve request error:", error);
    req.flash("error_msg", "Could not approve the request");
    res.redirect("/hospital/patients");
  }
};

// Decline a pending request (patient is not ours)
export const declineRequest = async (req, res) => {
  try {
    const account = await User.findByPk(req.session.userId);
    const facilityName = (account?.hospitalName || "").trim().toLowerCase();
    const request = await BloodRequest.findByPk(req.params.id);
    if (!request || !facilityName ||
        (request.hospitalName || "").trim().toLowerCase() !== facilityName ||
        request.hospitalStatus !== "pending") {
      req.flash("error_msg", "Request not available for review");
      return res.redirect("/hospital/patients");
    }
    await request.update({ hospitalStatus: "declined" });
    req.flash("success_msg", `Request #${request.id} declined (not your patient)`);
    res.redirect("/hospital/patients");
  } catch (error) {
    console.error("Decline request error:", error);
    req.flash("error_msg", "Could not decline the request");
    res.redirect("/hospital/patients");
  }
};
