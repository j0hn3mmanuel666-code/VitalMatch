/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { User } from "../models/userModel.js";
import { Donor } from "../models/donorModel.js";
import { Notification } from "../models/notificationModel.js";
import { Message } from "../models/messageModel.js";

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
      const u = await User.findByPk(req.session.userId);
      if (u) {
        const data = u.toJSON();
        res.locals.navUser = data;
        res.locals.navInitial = (data.firstName || "?").charAt(0).toUpperCase();
        const d = await Donor.findOne({ where: { userId: data.id }, order: [["createdAt", "DESC"]] });
        res.locals.navDonor = d ? d.toJSON() : null;
        res.locals.navUnread = await Notification.count({ where: { userId: data.id, isRead: false } });
        res.locals.navUnreadMsgs = await Message.count({ where: { receiverId: data.id, isRead: false } });
      }
    }
  } catch (e) {
    console.error("attachNavUser:", e.message);
  }
  next();
};

// Middleware to check if user is authenticated (also bounces deactivated accounts,
// so suspending a user takes effect even on their live session)
export const isAuthenticated = async (req, res, next) => {
  console.log(`🔍 [Auth Check] ${req.method} ${req.path}`);

  // Check if session exists at all
  if (!req.session) {
    console.log(`❌ [Auth Failed] No session object found`);
    req.flash("error_msg", "Session error. Please log in again.");
    return res.redirect("/login");
  }

  if (!req.session.userId) {
    console.log(`❌ [Auth Failed] No userId in session, redirecting to login`);
    req.flash("error_msg", "Please log in to access this page");
    return res.redirect("/login");
  }

  try {
    const account = await User.findByPk(req.session.userId, { attributes: ["id", "isActive", "role"] });
    if (!account || account.isActive === false) {
      console.log(`❌ [Auth Failed] Account ${req.session.userId} deactivated, destroying session`);
      return req.session.destroy(() => res.redirect("/login"));
    }
    // Apply admin role changes immediately: a demoted account loses its old
    // privileges on the very next request instead of at next login.
    if (account.role && account.role !== req.session.userRole) {
      console.log(`🔄 [Auth] Role changed for user ${req.session.userId}: '${req.session.userRole}' -> '${account.role}'`);
      req.session.userRole = account.role;
    }
  } catch (e) {
    console.error("isAuthenticated account check:", e.message);
    // Fail closed on DB errors: a transient failure must never bypass the
    // deactivation check.
    req.flash("error_msg", "Session error. Please log in again.");
    return res.redirect("/login");
  }

  console.log(`✅ [Auth Success] User ${req.session.userId} authenticated`);
  next();
};

// Middleware to check if user is admin
export const isAdmin = async (req, res, next) => {
  console.log(`🔍 [Admin Check] ${req.method} ${req.path} (userId: ${req.session.userId})`);
  
  if (!req.session) {
    console.log(`❌ [Admin Failed] No session object found`);
    req.flash("error_msg", "Session error. Please log in again.");
    return res.redirect("/login");
  }
  
  if (!req.session.userId) {
    console.log(`❌ [Admin Failed] No userId in session, redirecting to login`);
    req.flash("error_msg", "Please log in to access this page");
    return res.redirect("/login");
  }
  
  // Check for both uppercase and lowercase admin role
  const userRole = req.session.userRole?.toLowerCase();
  console.log(`🔍 [Role Check] Original role: '${req.session.userRole}', Lowercase: '${userRole}'`);
  
  if (userRole !== "admin") {
    console.log(`❌ [Admin Failed] User role is '${req.session.userRole}', expected 'admin' or 'ADMIN'`);
    req.flash("error_msg", "Access denied. Admin privileges required.");
    return res.redirect("/dashboard");
  }

  // Bounce deactivated admins so suspending an account takes effect immediately.
  // Fail closed when the account cannot be verified.
  const adminAccount = await User.findByPk(req.session.userId, { attributes: ["id", "isActive"] }).catch(() => null);
  if (!adminAccount || adminAccount.isActive === false) {
    console.log(`❌ [Admin Failed] Account ${req.session.userId} missing or deactivated, destroying session`);
    return req.session.destroy(() => res.redirect("/login"));
  }

  console.log(`✅ [Admin Success] User ${req.session.userId} has admin access`);
  next();
};

// Middleware to check if user is a hospital account
export const isHospital = async (req, res, next) => {
  console.log(`🔍 [Hospital Check] ${req.method} ${req.path} (userId: ${req.session.userId})`);
  
  if (!req.session) {
    console.log(`❌ [Hospital Failed] No session object found`);
    req.flash("error_msg", "Session error. Please log in again.");
    return res.redirect("/login");
  }
  
  if (!req.session.userId) {
    console.log(`❌ [Hospital Failed] No userId in session, redirecting to login`);
    req.flash("error_msg", "Please log in to access this page");
    return res.redirect("/login");
  }
  
  const userRole = req.session.userRole?.toLowerCase();
  if (userRole !== "hospital") {
    console.log(`❌ [Hospital Failed] User role is '${req.session.userRole}', expected 'hospital'`);
    req.flash("error_msg", "Access denied. Hospital privileges required.");
    return res.redirect("/dashboard");
  }

  // Bounce deactivated hospitals so suspending an account takes effect immediately.
  // Fail closed when the account cannot be verified.
  const hospitalAccount = await User.findByPk(req.session.userId, { attributes: ["id", "isActive"] }).catch(() => null);
  if (!hospitalAccount || hospitalAccount.isActive === false) {
    console.log(`❌ [Hospital Failed] Account ${req.session.userId} missing or deactivated, destroying session`);
    return req.session.destroy(() => res.redirect("/login"));
  }

  console.log(`✅ [Hospital Success] User ${req.session.userId} has hospital access`);
  next();
};
