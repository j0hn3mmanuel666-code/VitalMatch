import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";
import { Donor } from "../models/donorModel.js";
import { PasswordReset } from '../models/passwordResetModel.js';
import { getUserSettings, UserSetting } from "../models/userSettingModel.js";
import { validatePassword, passwordPolicyMessage, validatePhoneNumber, getBcryptRounds } from "../middleware/validation.js";
import { isDonorReady } from '../services/coordinationPolicy.js';
import { sessionIsCurrent } from '../services/sessionAuth.js';
import { AuditService } from '../services/auditService.js';
import { canonicalRole } from '../services/accountPolicy.js';
import { retryTransaction } from '../services/transactionService.js';

const auditContext = (req, transaction, actor) => ({ transaction, actorRole: canonicalRole(actor.role), source: 'self-service', ipAddress: req.ip || req.socket?.remoteAddress, userAgent: req.get?.('User-Agent') });
const lockCurrentAccount = async (req, transaction) => {
  const account = await User.findByPk(req.session.userId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!sessionIsCurrent(req.session, account)) throw new Error('Account authorization changed');
  return account;
};
// Display the user settings page
export const settingsPage = async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId);
    if (!user) {
      req.flash("error_msg", "Please log in to access settings");
      return res.redirect("/login");
    }
    const donor = await Donor.findOne({
      where: { userId: user.id },
      order: [["createdAt", "DESC"]]
    });
    const prefs = await getUserSettings(user.id);
    const allowedTabs = ["profile", "donor", "notifications", "security"];
    const activeTab = allowedTabs.includes(req.query.tab) ? req.query.tab : "profile";
    res.render("settings", {
      title: "Settings - VitalMatch",
      user,
      donor,
      prefs,
      activeTab,
      isDonor: !!donor
    });
  } catch (error) {
    console.error("Settings page error:");
    req.flash("error_msg", "Could not load settings");
    res.redirect("/dashboard");
  }
};

// Update basic profile (User model)
export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, address, hospitalName } = req.body;
    if (![firstName, lastName, phone, address].every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500) || !validatePhoneNumber(phone)) {
      req.flash("error_msg", "Please fill in all profile fields");
      return res.redirect("/settings?tab=profile");
    }
    const updates = { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), address: address.trim() };
    await retryTransaction(async transaction => {
      const account = await lockCurrentAccount(req, transaction);
      if (typeof hospitalName === 'string' && hospitalName.trim() && hospitalName.trim() !== (account.hospitalName || '')) throw new Error('Verified facility identity requires administrator review');
      const changedFields = Object.keys(updates).filter(field => updates[field] !== account[field]);
      await account.update(updates, { transaction });
      await AuditService.logAction(account.id, 'PROFILE_UPDATE', 'Users', account.id, null, { changedFields }, auditContext(req, transaction, account));
    });
    req.flash("success_msg", "Profile updated successfully");
    res.redirect("/settings?tab=profile");
  } catch (error) {
    console.error("Update profile error:");
    req.flash("error_msg", "Could not update profile");
    res.redirect("/settings?tab=profile");
  }
};

// Update donor preferences (Donor model)
export const updateDonorSettings = async (req, res) => {
  try {
    const { mobileNumber, emergencyContactName, emergencyContactNumber } = req.body;
    if (!validatePhoneNumber(mobileNumber) || (emergencyContactName && typeof emergencyContactName !== 'string') || (emergencyContactNumber && !validatePhoneNumber(emergencyContactNumber))) {
      req.flash("error_msg", "Contact number is required");
      return res.redirect("/settings?tab=donor");
    }
    const isAvailable = await retryTransaction(async transaction => {
      const account = await lockCurrentAccount(req, transaction);
      const donor = await Donor.findOne({ where: { userId: account.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!donor) return null;
      const available = req.body.isAvailable === 'on' && isDonorReady({ ...donor.toJSON(), isAvailable: true });
      const updates = {
        isAvailable: available,
        mobileNumber: mobileNumber.trim(),
        emergencyContactName: (emergencyContactName || donor.emergencyContactName || '').trim().slice(0, 255),
        emergencyContactNumber: (emergencyContactNumber || donor.emergencyContactNumber || '').trim()
      };
      const changedFields = Object.keys(updates).filter(field => updates[field] !== donor[field]);
      const oldAvailability = donor.isAvailable;
      await donor.update(updates, { transaction });
      await AuditService.logAction(account.id, 'DONOR_SETTINGS_UPDATE', 'Donors', donor.id, { isAvailable: oldAvailability }, { isAvailable: available, changedFields }, auditContext(req, transaction, account));
      return available;
    });
    if (isAvailable === null) {
      req.flash('error_msg', 'You do not have a donor profile yet. Please register as a donor first.');
      return res.redirect('/donor-profile');
    }
    if (isAvailable) {
      req.flash("success_msg", "Donor settings saved. You are now visible for matching.");
    } else {
      req.flash("success_msg", "Donor settings saved. You are now hidden from matching.");
    }
    res.redirect("/settings?tab=donor");
  } catch (error) {
    console.error("Update donor settings error:");
    req.flash("error_msg", "Could not update donor settings");
    res.redirect("/settings?tab=donor");
  }
};

// Update notification preferences (UserSetting model)
export const updateNotificationPrefs = async (req, res) => {
  try {
    const updates = {
      notifyMatches: req.body.notifyMatches === "on",
      notifyAppointments: req.body.notifyAppointments === "on",
      emailUpdates: req.body.emailUpdates === "on"
    };
    await retryTransaction(async transaction => {
      const account = await lockCurrentAccount(req, transaction);
      const [prefs] = await UserSetting.findOrCreate({ where: { userId: account.id }, defaults: { userId: account.id }, transaction });
      const oldValues = Object.fromEntries(Object.keys(updates).map(field => [field, prefs[field]]));
      await prefs.update(updates, { transaction });
      await AuditService.logAction(account.id, 'NOTIFICATION_PREFERENCES_UPDATE', 'UserSettings', prefs.id, oldValues, updates, auditContext(req, transaction, account));
    });
    req.flash("success_msg", "Notification preferences saved");
    res.redirect("/settings?tab=notifications");
  } catch (error) {
    console.error("Update notification prefs error:");
    req.flash("error_msg", "Could not save notification preferences");
    res.redirect("/settings?tab=notifications");
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findByPk(req.session.userId);
    if (!user) {
      req.flash("error_msg", "Please log in again");
      return res.redirect("/login");
    }
    if (![currentPassword, newPassword, confirmPassword].every(value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72)) {
      req.flash("error_msg", "Please fill in all password fields");
      return res.redirect("/settings?tab=security");
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      req.flash("error_msg", "Current password is incorrect");
      return res.redirect("/settings?tab=security");
    }
    if (newPassword !== confirmPassword) {
      req.flash("error_msg", "New passwords do not match");
      return res.redirect("/settings?tab=security");
    }
    if (!validatePassword(newPassword)) {
      req.flash("error_msg", passwordPolicyMessage());
      return res.redirect("/settings?tab=security");
    }
    const hashed = await bcrypt.hash(newPassword, getBcryptRounds());
    await retryTransaction(async transaction => {
      const lockedUser = await lockCurrentAccount(req, transaction);
      if (!lockedUser || !await bcrypt.compare(currentPassword, lockedUser.password)) throw new Error('Current credentials changed; retry');
      await PasswordReset.update({ used: true }, { where: { email: lockedUser.email, used: false }, transaction });
      await lockedUser.update({ password: hashed }, { transaction });
      await lockedUser.increment('authVersion', { transaction });
      await AuditService.logAction(user.id, 'PASSWORD_CHANGE', 'Users', user.id, null, { sessionsRevoked: true }, auditContext(req, transaction, lockedUser));
    });
    req.app.get('io')?.in(`user:${user.id}`).disconnectSockets(true);
    req.session.destroy(() => {
      res.clearCookie('vitalmatch.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      res.set('Clear-Site-Data', '"cache"');
      res.redirect('/login?passwordChanged=complete');
    });
  } catch (error) {
    console.error("Change password error:");
    req.flash("error_msg", "Could not change password");
    res.redirect("/settings?tab=security");
  }
};
