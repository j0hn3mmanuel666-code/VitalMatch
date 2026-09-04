
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
import { emailService } from "../services/emailService.js";
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
    const allRequests = await BloodRequest.findAll({ where: { userId } });
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

  return {
    activities: recentActivities,
    donorProfile: donorProfile ? donorProfile.toJSON() : null,
    user: userProfile ? userProfile.toJSON() : null,
    hospitalStats
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
      hospitalStats: null
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
      hospitalStats: null
    });
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

    // Hash password and create user
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashed,
      phone,
      address,
      dateOfBirth,
      gender,
      role: role || "donor", // Default to donor if not selected
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
