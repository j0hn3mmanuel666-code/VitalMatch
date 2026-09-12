/*
  Settings Controller
  Handles admin system settings and configuration
*/

import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';

// Store settings in a JSON file in project root
const SETTINGS_FILE = path.resolve(process.cwd(), 'settings.json');

// Default settings
const DEFAULT_SETTINGS = {
  general: {
    appName: 'VitalMatch',
    systemStatus: 'online',
    timeZone: 'Asia/Manila'
  },
  email: {
    smtpServer: '',
    smtpPort: 587,
    emailEncryption: 'tls',
    fromEmail: '',
    emailUsername: '',
    emailPassword: ''
  },
  notifications: {
    emailNotificationsEnabled: true,
    bloodRequestNotifications: true,
    registrationNotifications: true,
    systemAlertNotifications: true
  },
  security: {
    sessionTimeout: 30,
    minPasswordLength: 8,
    requireSpecialChars: true,
    twoFactorAuth: false,
    ipWhitelist: '',
    auditLogging: true
  }
};

// Load settings from file
async function loadSettings() {
  try {
    console.log('🔍 SETTINGS_FILE path:', SETTINGS_FILE);
    if (!SETTINGS_FILE) {
      throw new Error('SETTINGS_FILE path is undefined');
    }
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('⚠️  Settings file not found or error reading, creating new one');
    console.log('📝 Creating settings at:', SETTINGS_FILE);
    try {
      await saveSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    } catch (saveError) {
      console.error('❌ Error saving default settings:', saveError);
      throw saveError;
    }
  }
}

// Save settings to file
async function saveSettings(settings) {
  try {
    console.log('💾 Saving settings to:', SETTINGS_FILE);
    if (!SETTINGS_FILE) {
      throw new Error('SETTINGS_FILE path is undefined');
    }
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('✅ Settings saved successfully');
    return true;
  } catch (error) {
    console.error('❌ Error saving settings:', error);
    throw error;
  }
}

// Settings Page - Display current settings
export const settingsPage = async (req, res) => {
  try {
    console.log('📋 Loading settings page...');
    
    const settings = await loadSettings();
    console.log('✅ Settings loaded');
    
    // Render the admin-settings view with all required data.
    // NOTE: the local must NOT be named `settings` — Express exposes render
    // locals as options.settings, which would shadow the app settings object
    // (incl. the views dir) and crash layout resolution in hbs.
    res.render('admin-settings', {
      layout: 'admin',
      title: 'Admin Settings',
      user: req.session.user || {},
      settingsData: settings
    });
  } catch (error) {
    console.error('❌ Error loading settings page:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      details: error.message,
      message: error.message
    });
  }
};

// Save General Settings
export const saveGeneralSettings = async (req, res) => {
  try {
    const { appName, systemStatus, timeZone } = req.body;
    
    const settings = await loadSettings();
    settings.general = {
      appName: appName || settings.general.appName,
      systemStatus: systemStatus || settings.general.systemStatus,
      timeZone: timeZone || settings.general.timeZone
    };
    
    await saveSettings(settings);
    
    res.json({
      success: true,
      message: 'General settings saved successfully',
      settings: settings.general
    });
  } catch (error) {
    console.error('Error saving general settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Save Email Settings
export const saveEmailSettings = async (req, res) => {
  try {
    const { smtpServer, smtpPort, emailEncryption, fromEmail, emailUsername, emailPassword } = req.body;
    
    const settings = await loadSettings();
    settings.email = {
      smtpServer: smtpServer || settings.email.smtpServer,
      smtpPort: parseInt(smtpPort) || settings.email.smtpPort,
      emailEncryption: emailEncryption || settings.email.emailEncryption,
      fromEmail: fromEmail || settings.email.fromEmail,
      emailUsername: emailUsername || settings.email.emailUsername,
      emailPassword: emailPassword || settings.email.emailPassword
    };
    
    await saveSettings(settings);
    
    res.json({
      success: true,
      message: 'Email settings saved successfully',
      settings: {
        ...settings.email,
        emailPassword: '••••••••' // Don't return password
      }
    });
  } catch (error) {
    console.error('Error saving email settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Save Notification Settings
export const saveNotificationSettings = async (req, res) => {
  try {
    const { 
      emailNotificationsEnabled, 
      bloodRequestNotifications, 
      registrationNotifications,
      systemAlertNotifications 
    } = req.body;
    
    const settings = await loadSettings();
    settings.notifications = {
      emailNotificationsEnabled: emailNotificationsEnabled === true || emailNotificationsEnabled === 'true',
      bloodRequestNotifications: bloodRequestNotifications === true || bloodRequestNotifications === 'true',
      registrationNotifications: registrationNotifications === true || registrationNotifications === 'true',
      systemAlertNotifications: systemAlertNotifications === true || systemAlertNotifications === 'true'
    };
    
    await saveSettings(settings);
    
    res.json({
      success: true,
      message: 'Notification settings saved successfully',
      settings: settings.notifications
    });
  } catch (error) {
    console.error('Error saving notification settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Save Security Settings
export const saveSecuritySettings = async (req, res) => {
  try {
    const { 
      sessionTimeout, 
      minPasswordLength, 
      requireSpecialChars,
      twoFactorAuth,
      ipWhitelist,
      auditLogging
    } = req.body;
    
    const settings = await loadSettings();
    settings.security = {
      sessionTimeout: parseInt(sessionTimeout) || settings.security.sessionTimeout,
      minPasswordLength: parseInt(minPasswordLength) || settings.security.minPasswordLength,
      requireSpecialChars: requireSpecialChars === true || requireSpecialChars === 'true',
      twoFactorAuth: twoFactorAuth === true || twoFactorAuth === 'true',
      ipWhitelist: ipWhitelist || settings.security.ipWhitelist,
      auditLogging: auditLogging === true || auditLogging === 'true'
    };
    
    await saveSettings(settings);
    
    res.json({
      success: true,
      message: 'Security settings saved successfully',
      settings: settings.security
    });
  } catch (error) {
    console.error('Error saving security settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Test Email Configuration
export const testEmailSettings = async (req, res) => {
  try {
    const settings = await loadSettings();
    const { smtpServer, smtpPort, emailEncryption, fromEmail, emailUsername, emailPassword } = settings.email;
    
    // Validate email settings exist
    if (!smtpServer || !fromEmail || !emailUsername || !emailPassword) {
      return res.status(400).json({
        success: false,
        error: 'Email configuration is incomplete. Please configure all required fields.'
      });
    }
    
    // Create transporter with current settings
    const transporter = nodemailer.createTransport({
      host: smtpServer,
      port: smtpPort,
      secure: emailEncryption === 'ssl',
      auth: {
        user: emailUsername,
        pass: emailPassword
      }
    });
    
    // Send test email
    await transporter.sendMail({
      from: fromEmail,
      to: fromEmail,
      subject: 'VitalMatch - Email Configuration Test',
      html: `
        <h2>Email Configuration Test</h2>
        <p>This is a test email to verify your email configuration is working correctly.</p>
        <p>If you received this email, your SMTP settings are configured correctly.</p>
        <hr>
        <p><strong>Test Sent At:</strong> ${new Date().toLocaleString()}</p>
      `
    });
    
    res.json({
      success: true,
      message: 'Test email sent successfully! Check your inbox.'
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      error: `Failed to send test email: ${error.message}`
    });
  }
};

// Get all settings (API endpoint)
export const getSettings = async (req, res) => {
  try {
    const settings = await loadSettings();
    
    // Don't expose sensitive data
    const safeSettings = {
      ...settings,
      email: {
        ...settings.email,
        emailPassword: '••••••••'
      }
    };
    
    res.json({
      success: true,
      settings: safeSettings
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
