
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
    
import express from "express";
import { homePage } from "../controllers/homeController.js";
import { isAuthenticated, isAdmin, isHospital } from "../middleware/adminAuth.js";

// Import security and validation middleware
import { authLimiter, apiLimiter, uploadLimiter, csrfProtection } from "../middleware/security.js";
import { apiCache, dbOptimization } from "../middleware/performance.js";
import { 
  validateRegistration, 
  validateLogin, 
  validateBloodRequest, 
  validateProfileUpdate,
  validateAdminUserCreation,
  validateFileUpload,
  validateApiParams
} from "../middleware/validation.js";

const router = express.Router();

// Home page (public)
router.get("/", homePage);

// Authentication routes
import { loginPage, registerPage, forgotPasswordPage, dashboardPage, hospitalDashboardPage, loginUser, registerUser, logoutUser, verifyEmail, resendVerification, requestPasswordReset, resetPasswordPage, resetPassword, searchDashboard } from "../controllers/authController.js";

router.get("/login", loginPage);
router.post("/login", authLimiter, validateLogin, loginUser);
router.get("/register", registerPage);
router.post("/register", authLimiter, validateRegistration, registerUser);
router.get("/forgot-password", forgotPasswordPage);
router.post("/forgot-password", authLimiter, requestPasswordReset);
router.get("/reset-password/:token", resetPasswordPage);
router.post("/reset-password/:token", authLimiter, resetPassword);
router.get("/dashboard", isAuthenticated, dashboardPage);
router.get("/api/search", isAuthenticated, searchDashboard);
router.get("/logout", logoutUser);

// User History + Help pages
import { historyPage, helpPage } from "../controllers/userPagesController.js";

router.get("/history", isAuthenticated, historyPage);
router.get("/help", isAuthenticated, helpPage);

// Blood map (Leaflet + OpenStreetMap, no API key needed)
import { mapPage, mapPins } from "../controllers/mapController.js";

router.get("/map", isAuthenticated, mapPage);
router.get("/api/map-pins", isAuthenticated, mapPins);

// Email verification routes
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", authLimiter, resendVerification);

// Blood Request Routes (Protected)
import { requestBloodPage, newRequestBloodPage, simpleRequestBloodPage, viewBloodRequestPage, submitBloodRequest, pledgeToDonate, withdrawPledge, escalateRequest, clearEmergency } from "../controllers/bloodRequestController.js";

// Test route to debug routing issues
router.get("/test-route", (req, res) => {
  console.log("🧪 TEST ROUTE HIT!");
  console.log("🔍 Session Data:", req.session);
  res.json({
    message: "Test route works!",
    sessionUserId: req.session?.userId || 'none',
    sessionUserRole: req.session?.userRole || 'none',
    sessionId: req.sessionID,
    isAuthenticated: !!req.session?.userId,
    isAdmin: req.session?.userRole === 'admin'
  });
});

// Admin session debug route
router.get("/admin/debug-session", (req, res) => {
  console.log("🔍 [Admin Debug] Session Data:", req.session);
  res.json({
    sessionData: req.session,
    userId: req.session?.userId,
    userRole: req.session?.userRole,
    sessionId: req.sessionID,
    isAuthenticated: !!req.session?.userId,
    isAdmin: req.session?.userRole === 'admin'
  });
});

router.get("/simple-blood-request", isAuthenticated, simpleRequestBloodPage);
router.get("/new-blood-request", isAuthenticated, newRequestBloodPage);
router.get("/blood-request", isAuthenticated, requestBloodPage);
router.get("/request-blood", isAuthenticated, requestBloodPage);
router.get("/view-blood-request/:id", isAuthenticated, viewBloodRequestPage);
router.post("/requests/:id/pledge", isAuthenticated, pledgeToDonate);
router.post("/requests/:id/pledge/withdraw", isAuthenticated, withdrawPledge);
router.post("/requests/:id/escalate", isAuthenticated, escalateRequest);
router.post("/requests/:id/clear-emergency", isAuthenticated, clearEmergency);
router.post("/simple-blood-request", isAuthenticated, validateBloodRequest, submitBloodRequest);
router.post("/new-blood-request", isAuthenticated, validateBloodRequest, submitBloodRequest);
router.post("/blood-request", isAuthenticated, validateBloodRequest, submitBloodRequest);
router.post("/request-blood", isAuthenticated, validateBloodRequest, submitBloodRequest);

// Appointment / Schedule Routes (GET shows the page, POST performs the confirmation)
import { confirmSchedulePage, confirmScheduleSubmit, confirmByTokenPage, confirmByTokenSubmit, donorAppointmentsPage, declineAppointment } from "../controllers/appointmentController.js";
router.get("/confirm-schedule/:id/:role", isAuthenticated, confirmSchedulePage);
router.post("/confirm-schedule/:id/:role", isAuthenticated, confirmScheduleSubmit);
router.get("/schedule-confirm/:token", confirmByTokenPage);
router.post("/schedule-confirm/:token", confirmByTokenSubmit);
router.get("/my-appointments", isAuthenticated, donorAppointmentsPage);
router.post("/appointments/:id/decline", isAuthenticated, declineAppointment);

// Notification Routes (Protected)
import { getNotifications, markAsRead, markAllAsRead, clearAll, notificationsPage } from "../controllers/notificationController.js";

router.get("/notifications", isAuthenticated, notificationsPage);
router.get("/api/notifications", isAuthenticated, getNotifications);
router.post("/api/notifications/:id/read", isAuthenticated, markAsRead);
router.post("/api/notifications/read-all", isAuthenticated, markAllAsRead);
router.post("/api/notifications/clear-all", isAuthenticated, clearAll);


// Donor Profile and Requests Routes (Protected)
import { donorProfilePage, viewDonorProfilePage, updateDonorProfile, myRequestsPage, cancelRequest } from "../controllers/donorController.js";

router.get("/donor-profile", isAuthenticated, donorProfilePage);
router.get("/view-donor-profile", viewDonorProfilePage);
router.post("/donor-profile", isAuthenticated, validateProfileUpdate, updateDonorProfile);
router.get("/my-requests", isAuthenticated, myRequestsPage);
router.post("/cancel-request/:id", isAuthenticated, cancelRequest);

// User Settings Routes (Protected)
import { settingsPage as userSettingsPage, updateProfile, updateDonorSettings, updateNotificationPrefs, changePassword } from "../controllers/userSettingsController.js";

router.get("/settings", isAuthenticated, userSettingsPage);
router.post("/settings/profile", isAuthenticated, updateProfile);
router.post("/settings/donor", isAuthenticated, updateDonorSettings);
router.post("/settings/notifications", isAuthenticated, updateNotificationPrefs);
router.post("/settings/password", isAuthenticated, changePassword);

// Admin Routes (Protected - Admin Only)
import { adminDashboardPage, adminRequestsPage, adminDonorsPage, adminHospitalsPage, adminReportsPage, adminBlockchainPage, adminNewBloodRequestPage, createBloodRequest, fulfillRequest, deleteRequest, getUserManagementPage, getUserList, getUserDetails, createUser, updateUser, deleteUser, bulkUpdateUsers, exportUsers, adminAppointmentsPage, setHospitalStatus, exportReports } from "../controllers/adminController.js";

router.get("/hospital/dashboard", isAuthenticated, isHospital, hospitalDashboardPage);

// Hospital patient records
import { patientRecordsPage, approveRequest, declineRequest } from "../controllers/hospitalController.js";

router.get("/hospital/patients", isAuthenticated, isHospital, patientRecordsPage);
router.post("/hospital/requests/:id/approve", isAuthenticated, isHospital, approveRequest);
router.post("/hospital/requests/:id/decline", isAuthenticated, isHospital, declineRequest);
router.get("/admin/dashboard", isAdmin, adminDashboardPage);
router.get("/admin/requests", isAdmin, adminRequestsPage);
router.get("/admin/appointments", isAdmin, adminAppointmentsPage);
router.get("/admin/new-blood-request", isAdmin, adminNewBloodRequestPage);
router.post("/admin/new-blood-request", isAdmin, validateBloodRequest, createBloodRequest);
router.get("/admin/donors", isAdmin, adminDonorsPage);
router.get("/admin/hospitals", isAdmin, adminHospitalsPage);
router.post("/admin/hospitals/:id/:action", isAdmin, setHospitalStatus);
router.get("/admin/reports", isAdmin, adminReportsPage);
router.get("/admin/reports/export", isAdmin, exportReports);
router.get("/admin/blockchain", isAdmin, adminBlockchainPage);
router.post("/admin/fulfill-request/:id", isAdmin, fulfillRequest);
router.delete("/admin/delete-request/:id", isAdmin, deleteRequest);

// User Management Routes (Protected - Admin Only) with API optimizations
router.get("/admin/users", isAdmin, getUserManagementPage);
router.get("/admin/users/api", isAdmin, apiLimiter, dbOptimization, getUserList);
router.get("/admin/users/:id", isAdmin, apiLimiter, getUserDetails);
router.post("/admin/users", isAdmin, validateAdminUserCreation, createUser);
router.put("/admin/users/:id", isAdmin, validateApiParams(['firstName', 'lastName', 'email', 'role'], ['phone', 'bloodType', 'isActive', 'id', 'address', 'dateOfBirth', 'gender', 'hospitalName']), updateUser);
router.delete("/admin/users/:id", isAdmin, deleteUser);
router.post("/admin/users/bulk", isAdmin, bulkUpdateUsers);
router.get("/admin/users/export", isAdmin, exportUsers);

// Settings Routes (Protected - Admin Only)
import { settingsPage, saveGeneralSettings, saveEmailSettings, saveNotificationSettings, saveSecuritySettings, testEmailSettings, getSettings } from "../controllers/settingsController.js";

router.get("/admin/settings", isAdmin, settingsPage);
router.post("/admin/settings/general", isAdmin, saveGeneralSettings);
router.post("/admin/settings/email", isAdmin, saveEmailSettings);
router.post("/admin/settings/notifications", isAdmin, saveNotificationSettings);
router.post("/admin/settings/security", isAdmin, saveSecuritySettings);
router.post("/admin/settings/test-email", isAdmin, testEmailSettings);
router.get("/api/admin/settings", isAdmin, getSettings);

// Message Routes (Protected)
import { messagesPage, sendMessage, contactDonor, uploadVoiceMessage, sendVoiceMessage } from "../controllers/messageController.js";

router.get("/messages", isAuthenticated, messagesPage);
router.post("/messages/send", isAuthenticated, validateApiParams(['recipientId', 'message']), sendMessage);
router.post("/messages/send-voice", isAuthenticated, uploadLimiter, uploadVoiceMessage, validateFileUpload(['audio/wav', 'audio/mp3', 'audio/ogg'], 5 * 1024 * 1024), sendVoiceMessage);
router.get("/contact-donor/:requestId/:donorUserId", isAdmin, contactDonor);

// Call Routes (Protected) with API optimizations
import { getCallHistory, getConversationCallHistory, markCallAsSeen, getCallAnalytics } from "../controllers/callController.js";

router.get("/api/calls/history", isAuthenticated, apiLimiter, apiCache(60000), getCallHistory);
router.get("/api/calls/history/:conversationId", isAuthenticated, apiLimiter, apiCache(60000), getConversationCallHistory);
router.post("/api/calls/:callId/seen", isAuthenticated, markCallAsSeen);
router.get("/api/calls/analytics", isAdmin, apiLimiter, apiCache(300000), getCallAnalytics);

// API Routes with enhanced security and performance
router.get("/api/donors/search", isAuthenticated, apiLimiter, apiCache(300000), validateApiParams([], ['bloodType', 'location', 'availability']), (req, res) => {
  // Donor search API endpoint
  res.json({ message: "Donor search endpoint - to be implemented" });
});

router.get("/api/requests/urgent", isAuthenticated, apiLimiter, apiCache(60000), (req, res) => {
  // Urgent requests API endpoint
  res.json({ message: "Urgent requests endpoint - to be implemented" });
});

router.get("/api/statistics/dashboard", isAuthenticated, apiLimiter, apiCache(300000), (req, res) => {
  // Dashboard statistics API endpoint
  res.json({ message: "Dashboard statistics endpoint - to be implemented" });
});

// Blockchain API Routes
import { vitalMatchBlockchain } from "../services/blockchainService.js";

router.get("/api/blockchain/stats", isAuthenticated, (req, res) => {
  try {
    const stats = vitalMatchBlockchain.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get("/api/blockchain/donor/:donorId", isAuthenticated, (req, res) => {
  try {
    const donorId = req.params.donorId;
    
    // Check if user can access this donor's data (admin or own data)
    if (req.session.userRole !== 'admin' && req.session.userId != donorId) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }
    
    const history = vitalMatchBlockchain.getDonorHistory(donorId);
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get("/api/blockchain/request/:requestId", isAuthenticated, (req, res) => {
  try {
    const requestId = req.params.requestId;
    const chain = vitalMatchBlockchain.getRequestChain(requestId);
    
    res.json({
      success: true,
      data: chain
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post("/api/blockchain/mine", isAdmin, (req, res) => {
  try {
    const result = vitalMatchBlockchain.minePendingTransactions();
    
    if (result) {
      res.json({
        success: true,
        message: "Block mined successfully"
      });
    } else {
      res.json({
        success: false,
        message: "No pending transactions to mine"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get("/api/blockchain/verify", isAuthenticated, (req, res) => {
  try {
    const isValid = vitalMatchBlockchain.isChainValid();
    
    res.json({
      success: true,
      isValid: isValid,
      message: isValid ? "Blockchain is valid" : "Blockchain integrity compromised"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent blockchain activity
router.get("/api/blockchain/recent", isAuthenticated, (req, res) => {
  try {
    const chain = vitalMatchBlockchain.chain;
    const recentBlocks = chain.slice(-5).reverse(); // Get last 5 blocks, most recent first
    
    res.json({
      success: true,
      blocks: recentBlocks
    });
  } catch (error) {
    console.error("Error getting recent blockchain activity:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get recent blockchain activity"
    });
  }
});

// Call For Donation Routes
import { submitCall, adminViewCalls, adminUpdateCallStatus } from "../controllers/callForDonationController.js";

// Public route for form submission
router.post("/submit-call-for-donation", submitCall);

// Admin routes
router.get("/admin/calls", isAdmin, adminViewCalls);
router.post("/admin/calls/update-status", isAdmin, adminUpdateCallStatus);

// Public Content Management CMS Routes
import { 
  getAllPublicContent, 
  getPublicContentBySection, 
  createPublicContent, 
  updatePublicContent, 
  deletePublicContent,
  adminPublicContentPage
} from "../controllers/publicContentController.js";
import { imageUpload, uploadImageHandler } from "../controllers/uploadController.js";

// Public API routes (anyone can read)
router.get("/api/public-content", apiLimiter, getAllPublicContent);
router.get("/api/public-content/:section", apiLimiter, getPublicContentBySection);

// Admin CMS management routes (admin only)
router.get("/admin/cms", isAdmin, adminPublicContentPage);
router.post("/api/admin/public-content", isAdmin, validateApiParams(['section'], ['title', 'subtitle', 'description', 'primaryButtonText', 'primaryButtonLink', 'secondaryButtonText', 'secondaryButtonLink', 'imageUrl', 'metadata']), createPublicContent);
router.put("/api/admin/public-content/:section", isAdmin, validateApiParams([], ['section', 'title', 'subtitle', 'description', 'primaryButtonText', 'primaryButtonLink', 'secondaryButtonText', 'secondaryButtonLink', 'imageUrl', 'isActive', 'metadata']), updatePublicContent);
router.delete("/api/admin/public-content/:section", isAdmin, deletePublicContent);

// Image upload endpoint for admin (saves to public/uploads/images)
router.post('/api/admin/upload-image', isAdmin, uploadLimiter, imageUpload.single('image'), validateFileUpload(['image/jpeg','image/png','image/webp','image/gif'], 20 * 1024 * 1024), uploadImageHandler);

export default router;
