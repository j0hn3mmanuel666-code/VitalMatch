
/*
MIT License
 
Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import bcrypt from "bcrypt";
import { User, sequelize } from "../models/userModel.js";
import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { PasswordReset } from "../models/passwordResetModel.js";
import { emailService } from "../services/emailService.js";
import { validatePassword } from "../middleware/validation.js";
import { Op } from "sequelize";
await sequelize.sync();

export const loginPage = (req, res) => res.render("login", { title: "Login" });
export const registerPage = (req, res) => res.render("register", { title: "Register" });
export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: "Forgot Password" });
const buildDashboardData = async (userId) => {
  const recentRequests = await BloodRequest.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 5
  });

  const donorUpdates = await Donor.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 3
  });

  const activities = [];

  recentRequests.forEach(request => {
    activities.push({
      type: 'request',
      icon: 'request',
      title: `Blood Request #${request.id}`,
      description: `Requested ${request.unitsRequired} units of ${request.bloodType} blood`,
      status: request.status,
      date: request.createdAt,
      link: `/view-blood-request/${request.id}`
    });
  });

  donorUpdates.forEach(donor => {
    activities.push({
      type: 'donor',
      icon: 'profile',
      title: 'Donor Profile Updated',
      description: `Updated profile - Blood Type: ${donor.bloodType}, Status: ${donor.isAvailable ? 'Available' : 'Unavailable'}`,
      status: donor.isAvailable ? 'active' : 'inactive',
      date: donor.createdAt,
      link: '/view-donor-profile'
    });
  });

  activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  const recentActivities = activities.slice(0, 5);

  const userProfile = await User.findByPk(userId);
  const donorProfile = await Donor.findOne({ where: { userId } });

  let hospitalStats = null;
  if (userProfile && userProfile.role === 'hospital') {
    // Facility view: own submissions plus requests this facility approved
    const allRequests = await BloodRequest.findAll({
      where: { [Op.or]: [{ userId }, { hospitalId: userId }] }
    });
    const totalCount = allRequests.length;
    const activeCount = allRequests.filter(r => r.status === 'active').length;
    const fulfilledCount = allRequests.filter(r => r.status === 'fulfilled').length;
    const totalUnits = allRequests.reduce((sum, r) => sum + (r.unitsRequired || 0), 0);

    hospitalStats = {
      totalRequests: totalCount,
      activeRequests: activeCount,
      fulfilledRequests: fulfilledCount,
      totalUnitsRequested: totalUnits
    };
  }

  // Real urgent requests for the emergency alerts modal (live escalations first)
  const urgentRequests = await BloodRequest.findAll({
    where: { status: "active", urgency: { [Op.in]: ["critical", "urgent"] } },
    order: [["isEmergency", "DESC"], ["createdAt", "DESC"]],
    limit: 3
  });

  const timeAgo = (date) => {
    const mins = Math.floor((Date.now() - new Date(date)) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  const alerts = urgentRequests.map(r => {
    const data = r.toJSON();
    const emergencyActive = !!(
      data.isEmergency && data.emergencyExpiresAt &&
      new Date(data.emergencyExpiresAt) > new Date()
    );
    return {
      ...data,
      urgencyLabel: emergencyActive ? "EMERGENCY" : (data.urgency || "urgent").toUpperCase(),
      timeAgo: timeAgo(data.createdAt),
      emergencyActive
    };
  });

  // Real donation impact stats for this user (donations given, or own requests fulfilled)
  const impactWhere = donorProfile
    ? { assignedDonorId: donorProfile.id, status: "fulfilled" }
    : { userId, status: "fulfilled" };
  const totalDonations = await BloodRequest.count({ where: impactWhere });
  const livesSaved = totalDonations * 2;

  // Donor status + next eligibility (56-day whole-blood interval)
  let donorStatus = "Not Registered";
  let nextEligible = "Ready";
  if (donorProfile) {
    donorStatus = donorProfile.isAvailable ? "Active" : "Paused";
    if (donorProfile.lastDonationDate) {
      const eligibleDate = new Date(donorProfile.lastDonationDate);
      eligibleDate.setDate(eligibleDate.getDate() + 56);
      if (eligibleDate > new Date()) {
        nextEligible = eligibleDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
    }
  }

  // Monthly activity (last 6 months) for the mini chart
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
  sixMonthsAgo.setHours(0, 0, 0, 0);
  const recentFulfilled = await BloodRequest.findAll({
    where: { ...impactWhere, updatedAt: { [Op.gte]: sixMonthsAgo } },
    attributes: ["updatedAt"],
    raw: true
  });
  const monthBuckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    monthBuckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      count: 0
    });
  }
  recentFulfilled.forEach(r => {
    const d = new Date(r.updatedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthBuckets.find(b => b.key === key);
    if (bucket) bucket.count++;
  });
  const maxCount = Math.max(1, ...monthBuckets.map(b => b.count));
  const donationChart = monthBuckets.map(b => ({
    label: b.label,
    height: b.count > 0 ? Math.max(12, Math.round((b.count / maxCount) * 100)) : 6
  }));

  // Monthly request volume (last 6 months) for the hospital mini chart
  let hospitalChart = [];
  if (userProfile && userProfile.role === "hospital") {
    const ownRecent = await BloodRequest.findAll({
      where: { userId, createdAt: { [Op.gte]: sixMonthsAgo } },
      attributes: ["createdAt"],
      raw: true
    });
    const ownBuckets = monthBuckets.map(b => ({ ...b, count: 0 }));
    ownRecent.forEach(r => {
      const d = new Date(r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = ownBuckets.find(b => b.key === key);
      if (bucket) bucket.count++;
    });
    const ownMax = Math.max(1, ...ownBuckets.map(b => b.count));
    hospitalChart = ownBuckets.map(b => ({
      label: b.label,
      height: b.count > 0 ? Math.max(12, Math.round((b.count / ownMax) * 100)) : 6
    }));
  }

  return {
    activities: recentActivities,
    donorProfile: donorProfile ? donorProfile.toJSON() : null,
    user: userProfile ? userProfile.toJSON() : null,
    hospitalStats,
    urgentRequests: alerts,
    donationStats: {
      totalDonations,
      livesSaved,
      donationBar: Math.min(100, totalDonations * 10),
      livesBar: Math.min(100, livesSaved * 5)
    },
    donorStatus,
    nextEligible,
    donationChart,
    hospitalChart
  };
};

export const dashboardPage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const dashboardData = await buildDashboardData(req.session.userId);
    res.render("dashboard", {
      title: "Dashboard",
      ...dashboardData
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.render("dashboard", {
      title: "Dashboard",
      activities: [],
      donorProfile: null,
      user: null,
      hospitalStats: null,
      urgentRequests: [],
      donationStats: { totalDonations: 0, livesSaved: 0, donationBar: 0, livesBar: 0 },
      donorStatus: "Unavailable",
      nextEligible: "Ready",
      donationChart: [],
      hospitalChart: []
    });
  }
};

export const hospitalDashboardPage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const dashboardData = await buildDashboardData(req.session.userId);
    if (!dashboardData.user || dashboardData.user.role !== 'hospital') {
      return res.redirect("/dashboard");
    }

    res.render("dashboard", {
      title: "Hospital Dashboard",
      ...dashboardData
    });
  } catch (error) {
    console.error("Error fetching hospital dashboard data:", error);
    res.render("dashboard", {
      title: "Hospital Dashboard",
      activities: [],
      donorProfile: null,
      user: null,
      hospitalStats: null,
      urgentRequests: [],
      donationStats: { totalDonations: 0, livesSaved: 0, donationBar: 0, livesBar: 0 },
      donorStatus: "Unavailable",
      nextEligible: "Ready",
      donationChart: [],
      hospitalChart: []
    });
  }
};

// Real dashboard search: user's own requests + app pages
export const searchDashboard = async (req, res) => {
  try {
    const q = (req.query.q || "").trim().toLowerCase();
    if (q.length < 2) return res.json({ success: true, results: [] });

    const myRequests = await BloodRequest.findAll({
      where: { userId: req.session.userId },
      order: [["createdAt", "DESC"]],
      limit: 20
    });

    const results = myRequests
      .filter(r =>
        String(r.id).includes(q) ||
        (r.patientName || "").toLowerCase().includes(q) ||
        (r.hospitalName || "").toLowerCase().includes(q) ||
        (r.bloodType || "").toLowerCase().includes(q) ||
        (r.city || "").toLowerCase().includes(q)
      )
      .slice(0, 4)
      .map(r => ({
        type: "request",
        title: `Blood Request #${r.id} (${r.bloodType})`,
        subtitle: `${r.patientName} at ${r.hospitalName}`,
        url: `/view-blood-request/${r.id}`,
        status: r.status
      }));

    const pages = [
      { type: "page", title: "Request Blood", subtitle: "Submit a new blood request", url: "/new-blood-request" },
      { type: "page", title: "My Requests", subtitle: "View your blood requests", url: "/my-requests" },
      { type: "page", title: "My Profile", subtitle: "Update your donor information", url: "/view-donor-profile" },
      { type: "page", title: "Messages", subtitle: "Chat with hospitals and donors", url: "/messages" },
      { type: "page", title: "Settings", subtitle: "Manage your account settings", url: "/settings" }
    ].filter(p => p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q));

    res.json({ success: true, results: [...results, ...pages].slice(0, 6) });
  } catch (error) {
    console.error("Dashboard search error:", error);
    res.status(500).json({ success: false, results: [] });
  }
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  console.log(`🔐 [Login Attempt] Email: ${email}`);

  const user = await User.findOne({ where: { email } });
  if (!user) {
    console.log(`❌ [Login Failed] User not found: ${email}`);
    return res.render("login", { error: "User not found with that email address." });
  }

  // Check if email is verified
  if (!user.emailVerified) {
    console.log(`❌ [Login Failed] Email not verified: ${email}`);
    return res.render("login", { error: "Please verify your email address before logging in. Check your inbox for the verification email." });
  }

  // Check if account is active (hospitals need admin verification, anyone can be suspended)
  if (user.isActive === false) {
    if (user.role?.toLowerCase() === "hospital") {
      console.log(`❌ [Login Failed] Hospital pending verification: ${email}`);
      return res.render("login", { error: "Your hospital account is pending verification by an administrator. Please try again later." });
    }
    console.log(`❌ [Login Failed] Account deactivated: ${email}`);
    return res.render("login", { error: "Your account has been deactivated. Please contact support." });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    console.log(`❌ [Login Failed] Incorrect password: ${email}`);
    return res.render("login", { error: "Incorrect password." });
  }

  // Replace the old session so a previous account cannot leak into this login.
  req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      console.log(`❌ [Session Regeneration Error]:`, regenerateError);
      return res.render("login", { error: "Login failed due to a server error. Please try again." });
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;

    console.log(`✅ [Login Success] User ${user.id} (${email}) logged in`);
    console.log(`🔍 [Session Set] userId: ${req.session.userId}, userRole: ${req.session.userRole}`);
    console.log(`🔍 [Session ID]: ${req.sessionID}`);

    // Force session save before redirect
    req.session.save((saveError) => {
      if (saveError) {
        console.log(`❌ [Session Save Error]:`, saveError);
        return res.render("login", { error: "Login failed due to a server error. Please try again." });
      }

      console.log(`✅ [Session Saved Successfully]`);

      // Redirect based on role
      if (user.role?.toLowerCase() === "admin") {
        console.log(`🔄 [Redirect] Admin to /admin/dashboard`);
        res.redirect("/admin/dashboard");
      } else if (user.role?.toLowerCase() === "hospital") {
        console.log(`🔄 [Redirect] Hospital to /hospital/dashboard`);
        res.redirect("/hospital/dashboard");
      } else {
        console.log(`🔄 [Redirect] User to /dashboard`);
        res.redirect("/dashboard");
      }
    });
  });
};

export const registerUser = async (req, res) => {
  const { firstName, lastName, email, password, confirmPassword, phone, address, dateOfBirth, gender, role } = req.body;

  // Validate password match
  if (password !== confirmPassword) {
    return res.render("register", { error: "Passwords do not match." });
  }

  // Check if user already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    return res.render("register", { error: "That email address is already registered." });
  }

  try {
    // Generate verification token
    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Hash password and create user.
    // Hospital accounts start inactive until an administrator verifies them.
    const hashed = await bcrypt.hash(password, 10);
    const userRole = role || "donor"; // Default to donor if not selected
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashed,
      phone,
      address,
      dateOfBirth,
      gender,
      role: userRole,
      isActive: userRole.toLowerCase() !== "hospital",
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires
    });

    // Send verification email
    console.log('📧 [Registration] Attempting to send verification email to:', email);
    console.log('📧 [Registration] Using email service type:', process.env.EMAIL_USER === 'your-email@gmail.com' ? 'TEST (Ethereal)' : 'REAL SMTP');
    const result = await emailService.sendVerificationEmail(email, firstName, verificationToken);
    console.log('📧 [Registration] Email sent result:', result.success);

    if (result.success) {
      console.log('✅ [Registration] Verification email sent successfully');
      res.render("register-success", {
        title: "Registration Successful",
        email: email,
        firstName: firstName,
        previewUrl: result.previewUrl
      });
    } else {
      console.log('❌ [Registration] Failed to send verification email');
      // If email fails, still create account but show warning
      res.send("Account created successfully, but we couldn't send the verification email. Please contact support.");
    }

  } catch (error) {
    console.error("Registration error:", error);
    res.render("register", { error: "Registration failed due to a server error. Please try again." });
  }
};

export const logoutUser = (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout session error:", error);
    }

    res.clearCookie('vitalmatch.sid');
    res.redirect("/login");
  });
};

// Email verification handler
export const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.send("Invalid verification link");
  }

  try {
    // Find user with this token
    const user = await User.findOne({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { [Op.gt]: new Date() } // Token not expired
      }
    });

    if (!user) {
      return res.render("verification-failed", {
        title: "Verification Failed",
        message: "Invalid or expired verification link"
      });
    }

    // Update user as verified
    await user.update({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null
    });

    // Send welcome email
    await emailService.sendWelcomeEmail(user.email, user.firstName);

    res.render("verification-success", {
      title: "Email Verified",
      firstName: user.firstName
    });

  } catch (error) {
    console.error("Email verification error:", error);
    res.send("Verification failed. Please try again.");
  }
};

// Resend verification email
export const resendVerification = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.emailVerified) {
      return res.json({ success: false, message: "Email already verified" });
    }

    // Generate new token
    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await user.update({
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires
    });

    // Send verification email
    const result = await emailService.sendVerificationEmail(email, user.firstName, verificationToken);

    if (result.success) {
      res.json({ success: true, message: "Verification email sent successfully", previewUrl: result.previewUrl });
    } else {
      res.json({ success: false, message: "Failed to send verification email" });
    }

  } catch (error) {
    console.error("Resend verification error:", error);
    res.json({ success: false, message: "Failed to resend verification email" });
  }
};

// Request a password reset link (always shows success to prevent email enumeration)
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      req.flash("error_msg", "Please enter your email address");
      return res.redirect("/forgot-password");
    }

    const user = await User.findOne({ where: { email } });

    if (user) {
      // Invalidate older unused tokens for this email
      await PasswordReset.update({ used: true }, { where: { email, used: false } });

      const token = emailService.generateVerificationToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await PasswordReset.create({ email, token, expiresAt });

      const result = await emailService.sendPasswordResetEmail(email, user.firstName, token);
      if (!result.success) {
        console.error("Failed to send password reset email to:", email);
      }
    }

    res.render("forgotpassword", {
      title: "Forgot Password",
      resetSent: true
    });
  } catch (error) {
    console.error("Request password reset error:", error);
    req.flash("error_msg", "Something went wrong. Please try again.");
    res.redirect("/forgot-password");
  }
};

// Display the reset password form for a valid token
export const resetPasswordPage = async (req, res) => {
  try {
    const { token } = req.params;
    const record = await PasswordReset.findOne({ where: { token, used: false } });

    if (!record || record.expiresAt < new Date()) {
      return res.render("reset-password", {
        title: "Reset Password",
        tokenValid: false,
        token
      });
    }

    res.render("reset-password", {
      title: "Reset Password",
      tokenValid: true,
      token
    });
  } catch (error) {
    console.error("Reset password page error:", error);
    res.render("reset-password", { title: "Reset Password", tokenValid: false, token: null });
  }
};

// Handle the new password submission
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    const record = await PasswordReset.findOne({ where: { token, used: false } });
    if (!record || record.expiresAt < new Date()) {
      req.flash("error_msg", "This reset link is invalid or has expired");
      return res.redirect("/forgot-password");
    }

    if (!newPassword || !confirmPassword) {
      req.flash("error_msg", "Please fill in all password fields");
      return res.redirect(`/reset-password/${token}`);
    }

    if (newPassword !== confirmPassword) {
      req.flash("error_msg", "Passwords do not match");
      return res.redirect(`/reset-password/${token}`);
    }

    if (!validatePassword(newPassword)) {
      req.flash("error_msg", "Password must be at least 8 characters with uppercase, lowercase, and a number");
      return res.redirect(`/reset-password/${token}`);
    }

    const user = await User.findOne({ where: { email: record.email } });
    if (!user) {
      req.flash("error_msg", "Account not found");
      return res.redirect("/forgot-password");
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashed });
    await record.update({ used: true });

    req.flash("success_msg", "Password reset successfully. Please log in with your new password.");
    res.redirect("/login");
  } catch (error) {
    console.error("Reset password error:", error);
    req.flash("error_msg", "Something went wrong. Please try again.");
    res.redirect("/forgot-password");
  }
};
