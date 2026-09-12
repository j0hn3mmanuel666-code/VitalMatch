/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { ScheduleToken } from "../models/scheduleTokenModel.js";
import { Notification } from "../models/notificationModel.js";
import { getUserSettings } from "../models/userSettingModel.js";

// Verify the logged-in user owns this side of the appointment.
// Returns { request } on success or { error, request? } otherwise.
async function loadOwnedRequest(req, id, role) {
  const request = await BloodRequest.findByPk(id);
  if (!request) return { error: "notfound" };
  if (role !== "donor" && role !== "requester") return { error: "role" };
  if (!req.session?.userId) return { error: "login", request };

  if (role === "donor") {
    const donor = await Donor.findOne({ where: { userId: req.session.userId } });
    if (!donor || request.assignedDonorId !== donor.id) {
      return { error: "forbidden", request };
    }
  } else {
    if (request.userId !== req.session.userId) {
      return { error: "forbidden", request };
    }
  }
  return { request };
}

function renderConfirmError(res, error) {
  if (error === "login") {
    return res.redirect("/login");
  }
  if (error === "forbidden") {
    return res.status(403).render('404', {
      title: 'Not Authorized',
      message: 'This confirmation link belongs to someone else. Please log in with the correct account.'
    });
  }
  return res.status(404).render('404', {
    title: error === "role" ? 'Invalid Link' : 'Request Not Found',
    message: error === "role"
      ? 'The confirmation link is invalid.'
      : 'The requested appointment could not be found.'
  });
}

function confirmationState(request, role) {
  const alreadyConfirmed = role === "donor" ? !!request.donorConfirmed : !!request.requesterConfirmed;
  return {
    title: 'Confirm Schedule - VitalMatch',
    role,
    request: request.toJSON(),
    confirmed: false,
    alreadyConfirmed,
    postUrl: `/confirm-schedule/${request.id}/${role}`,
    token: null
  };
}

// GET /confirm-schedule/:id/:role — display only, never confirms (login + ownership required)
export const confirmSchedulePage = async (req, res) => {
  try {
    const { id, role } = req.params;
    const { error, request } = await loadOwnedRequest(req, id, role);
    if (error) return renderConfirmError(res, error);
    res.render('schedule-confirmed', confirmationState(request, role));
  } catch (error) {
    console.error('Error loading schedule confirmation:', error);
    res.status(500).send('An error occurred while loading the schedule.');
  }
};

// POST /confirm-schedule/:id/:role — perform the confirmation
export const confirmScheduleSubmit = async (req, res) => {
  try {
    const { id, role } = req.params;
    const { error, request } = await loadOwnedRequest(req, id, role);
    if (error) return renderConfirmError(res, error);

    if (role === "donor") {
      await request.update({ donorConfirmed: true });
    } else {
      await request.update({ requesterConfirmed: true });
    }

    res.render('schedule-confirmed', {
      ...confirmationState(request, role),
      title: 'Schedule Confirmed - VitalMatch',
      confirmed: true
    });
  } catch (error) {
    console.error('Error confirming schedule:', error);
    res.status(500).send('An error occurred while confirming the schedule.');
  }
};

// Donor's upcoming donation appointments
export const donorAppointmentsPage = async (req, res) => {
  try {
    const donor = await Donor.findOne({
      where: { userId: req.session.userId },
      order: [["createdAt", "DESC"]]
    });
    if (!donor) {
      req.flash("error_msg", "Please register as a donor first");
      return res.redirect("/donor-profile");
    }
    const appointments = await BloodRequest.findAll({
      where: { assignedDonorId: donor.id, status: "scheduled" },
      order: [["scheduledDate", "ASC"]]
    });
    res.render("my-appointments", {
      title: "My Appointments - VitalMatch",
      appointments,
      donor: donor.toJSON()
    });
  } catch (error) {
    console.error("Donor appointments page error:", error);
    req.flash("error_msg", "Could not load appointments");
    res.redirect("/dashboard");
  }
};

// Donor declines an appointment: request returns to the matching pool
export const declineAppointment = async (req, res) => {
  try {
    const request = await BloodRequest.findByPk(req.params.id);
    const donor = await Donor.findOne({ where: { userId: req.session.userId } });

    if (!request || !donor || request.assignedDonorId !== donor.id || request.status !== "scheduled") {
      req.flash("error_msg", "Appointment not found");
      return res.redirect("/my-appointments");
    }

    await request.update({
      status: "active",
      assignedDonorId: null,
      scheduledDate: null,
      donorConfirmed: false,
      requesterConfirmed: false,
      fulfillmentNotes: null,
      isEmergency: false,
      emergencyAt: null,
      emergencyExpiresAt: null
    });

    if (request.userId) {
      const prefs = await getUserSettings(request.userId);
      if (!prefs || prefs.notifyAppointments) {
        await Notification.create({
          userId: request.userId,
          title: "Donor Declined Appointment",
          message: `The scheduled donor for your blood request #${request.id} declined. The request is back in matching.`,
          type: "warning",
          link: `/view-blood-request/${request.id}`
        });
      }
    }

    req.flash("success_msg", "Appointment declined. The request is back in matching.");
    res.redirect("/my-appointments");
  } catch (error) {
    console.error("Decline appointment error:", error);
    req.flash("error_msg", "Could not decline the appointment");
    res.redirect("/my-appointments");
  }
};

async function loadTokenRequest(token) {
  const record = await ScheduleToken.findOne({ where: { token, used: false } });
  if (!record || record.expiresAt < new Date()) return { error: "expired" };
  const request = await BloodRequest.findByPk(record.bloodRequestId);
  if (!request) return { error: "notfound" };
  if (record.role !== "donor" && record.role !== "requester") return { error: "role" };
  return { record, request };
}

// GET /schedule-confirm/:token — display only (single-use token link for email recipients)
export const confirmByTokenPage = async (req, res) => {
  try {
    const { error, record, request } = await loadTokenRequest(req.params.token);
    if (error) {
      return res.status(410).render('schedule-confirmed', {
        title: 'Link Expired - VitalMatch',
        invalid: true
      });
    }
    res.render('schedule-confirmed', {
      ...confirmationState(request, record.role),
      postUrl: `/schedule-confirm/${record.token}`,
      token: record.token
    });
  } catch (error) {
    console.error('Error loading token confirmation:', error);
    res.status(500).send('An error occurred while loading the schedule.');
  }
};

// POST /schedule-confirm/:token — perform the confirmation and burn the token
export const confirmByTokenSubmit = async (req, res) => {
  try {
    const { error, record, request } = await loadTokenRequest(req.params.token);
    if (error) {
      return res.status(410).render('schedule-confirmed', {
        title: 'Link Expired - VitalMatch',
        invalid: true
      });
    }

    if (record.role === "donor") {
      await request.update({ donorConfirmed: true });
    } else {
      await request.update({ requesterConfirmed: true });
    }
    await record.update({ used: true });

    res.render('schedule-confirmed', {
      ...confirmationState(request, record.role),
      title: 'Schedule Confirmed - VitalMatch',
      confirmed: true,
      postUrl: `/schedule-confirm/${record.token}`,
      token: record.token
    });
  } catch (error) {
    console.error('Error confirming schedule by token:', error);
    res.status(500).send('An error occurred while confirming the schedule.');
  }
};
