/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

// Middleware to check if user is authenticated
export const isAuthenticated = (req, res, next) => {
  console.log(`🔍 [Auth Check] ${req.method} ${req.path}`);
  console.log(`🔍 [Session] userId: ${req.session.userId}, sessionID: ${req.sessionID}`);
  console.log(`🔍 [Headers] Cookie: ${req.headers.cookie}`);
  console.log(`🔍 [Session Data]:`, req.session);
  
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
  
  console.log(`✅ [Auth Success] User ${req.session.userId} authenticated`);
  next();
};

// Middleware to check if user is admin
export const isAdmin = (req, res, next) => {
  console.log(`🔍 [Admin Check] ${req.method} ${req.path}`);
  console.log(`🔍 [Session] userId: ${req.session.userId}, userRole: ${req.session.userRole}, sessionID: ${req.sessionID}`);
  console.log(`🔍 [Full Session Data]:`, JSON.stringify(req.session, null, 2));
  console.log(`🔍 [Headers] Cookie: ${req.headers.cookie}`);
  
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
  
  console.log(`✅ [Admin Success] User ${req.session.userId} has admin access`);
  next();
};

// Middleware to check if user is a hospital account
export const isHospital = (req, res, next) => {
  console.log(`🔍 [Hospital Check] ${req.method} ${req.path}`);
  console.log(`🔍 [Session] userId: ${req.session.userId}, userRole: ${req.session.userRole}, sessionID: ${req.sessionID}`);
  
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
  
  console.log(`✅ [Hospital Success] User ${req.session.userId} has hospital access`);
  next();
};
