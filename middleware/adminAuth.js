/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { User } from "../models/userModel.js";
import { Donor } from "../models/donorModel.js";
import { Notification } from "../models/notificationModel.js";
import { Message } from "../models/messageModel.js";
import { loadSessionAccount, destroySession } from "../services/sessionAuth.js";
import { canonicalRole } from '../services/accountPolicy.js';

// Attach nav data (user, donor, unread counts) for the shared user sidebar.
// Uses res.locals so it never overrides explicit render variables.
export const attachNavUser = async (req, res, next) => {
  res.locals.navUser = null;
  res.locals.navDonor = null;
  res.locals.navInitial = "?";
  res.locals.navUnread = 0;
  res.locals.navUnreadMsgs = 0;
  try {
    if (req.session?.userId) {
      const current = req.authAccount || await loadSessionAccount(req.session);
      if (!current) return destroySession(req, res);
      req.authAccount = current;
      req.session.userRole = canonicalRole(current.role);
      const u = await User.findByPk(req.session.userId, { attributes: ["id", "firstName", "lastName", "role", "hospitalName", "facilityId"] });
      if (u) {
        const data = u.toJSON();
        data.role = canonicalRole(data.role);
        res.locals.navUser = data;
        res.locals.navInitial = (data.firstName || "?").charAt(0).toUpperCase();
        const d = await Donor.findOne({ where: { userId: data.id }, order: [["createdAt", "DESC"]] });
        res.locals.navDonor = d ? d.toJSON() : null;
        res.locals.navUnread = await Notification.count({ where: { userId: data.id, isRead: false } });
        res.locals.navUnreadMsgs = await Message.count({ where: { receiverId: data.id, isRead: false } });
      }
    }
  } catch (e) {
    return next(e);
  }
  next();
};

// Every authorization decision uses current database state, including role changes.
export const isAuthenticated = async (req, res, next) => {
  try {
    const account = req.authAccount || await loadSessionAccount(req.session);
    if (!account) return destroySession(req, res);
    req.authAccount = account;
    req.session.userRole = canonicalRole(account.role);
    if (req.method !== 'GET' || (!req.path?.startsWith('/api/') && !req.path?.endsWith('/api'))) {
      req.session.lastActivityAt = Date.now();
    }
    next();
  } catch (error) { next(error); }
};

const requireRole = (roles) => async (req, res, next) => {
  await isAuthenticated(req, res, (error) => {
    if (error) return next(error);
    if (roles.includes(canonicalRole(String(req.authAccount.role).toLowerCase()))) return next();
    if (req.path?.startsWith('/api/') || req.get('Accept')?.includes('application/json')) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    req.flash('error_msg', 'Access denied for this account.');
    return res.redirect('/dashboard');
  });
};

export const isAdmin = requireRole(['admin']);
export const isHospital = requireRole(['hospital', 'hospital_admin']);
