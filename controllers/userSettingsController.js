import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";
import { Donor } from "../models/donorModel.js";
import { getUserSettings, sequelize } from "../models/userSettingModel.js";
import { validatePassword } from "../middleware/validation.js";
await sequelize.sync();

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
    console.error("Settings page error:", error);
    req.flash("error_msg", "Could not load settings");
    res.redirect("/dashboard");
  }
};

// Update basic profile (User model)
export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, address, hospitalName } = req.body;
    if (!firstName || !lastName || !phone || !address) {
      req.flash("error_msg", "Please fill in all profile fields");
      return res.redirect("/settings?tab=profile");
    }
    const updates = { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), address: address.trim() };
    if (typeof hospitalName === "string" && hospitalName.trim()) {
      updates.hospitalName = hospitalName.trim();
    }
    await User.update(updates, { where: { id: req.session.userId } });
    req.flash("success_msg", "Profile updated successfully");
    res.redirect("/settings?tab=profile");
  } catch (error) {
    console.error("Update profile error:", error);
    req.flash("error_msg", "Could not update profile");
    res.redirect("/settings?tab=profile");
  }
};

// Update donor preferences (Donor model)
export const updateDonorSettings = async (req, res) => {
  try {
    const donor = await Donor.findOne({ where: { userId: req.session.userId } });
    if (!donor) {
      req.flash("error_msg", "You do not have a donor profile yet. Please register as a donor first.");
      return res.redirect("/donor-profile");
    }
    const { mobileNumber, emergencyContactName, emergencyContactNumber } = req.body;
    if (!mobileNumber) {
      req.flash("error_msg", "Contact number is required");
      return res.redirect("/settings?tab=donor");
    }
    const isAvailable = req.body.isAvailable === "on";
    await donor.update({
      isAvailable,
      mobileNumber: mobileNumber.trim(),
      emergencyContactName: (emergencyContactName || donor.emergencyContactName).trim(),
      emergencyContactNumber: (emergencyContactNumber || donor.emergencyContactNumber).trim()
    });
    if (isAvailable) {
      req.flash("success_msg", "Donor settings saved. You are now visible for matching.");
    } else {
      req.flash("success_msg", "Donor settings saved. You are now hidden from matching.");
    }
    res.redirect("/settings?tab=donor");
  } catch (error) {
    console.error("Update donor settings error:", error);
    req.flash("error_msg", "Could not update donor settings");
    res.redirect("/settings?tab=donor");
  }
};

// Update notification preferences (UserSetting model)
export const updateNotificationPrefs = async (req, res) => {
  try {
    const prefs = await getUserSettings(req.session.userId);
    await prefs.update({
      notifyMatches: req.body.notifyMatches === "on",
      notifyAppointments: req.body.notifyAppointments === "on",
      emailUpdates: req.body.emailUpdates === "on"
    });
    req.flash("success_msg", "Notification preferences saved");
    res.redirect("/settings?tab=notifications");
  } catch (error) {
    console.error("Update notification prefs error:", error);
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
    if (!currentPassword || !newPassword || !confirmPassword) {
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
      req.flash("error_msg", "Password must be at least 8 characters with uppercase, lowercase, and a number");
      return res.redirect("/settings?tab=security");
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashed });
    req.flash("success_msg", "Password changed successfully");
    res.redirect("/settings?tab=security");
  } catch (error) {
    console.error("Change password error:", error);
    req.flash("error_msg", "Could not change password");
    res.redirect("/settings?tab=security");
  }
};
