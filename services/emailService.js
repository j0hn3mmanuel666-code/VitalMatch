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

import nodemailer from 'nodemailer';
import crypto from 'crypto';

/**
 * Email Service for VitalMatch
 * Handles email verification and notifications
 */
export class EmailService {

  constructor() {
    // Check if real SMTP credentials are provided
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS &&
      process.env.EMAIL_USER !== 'your-email@gmail.com' &&
      process.env.EMAIL_PASS !== 'your-app-password') {
      this.setupRealTransporter();
    } else {
      // Fallback to test transporter for development
      this.setupTestTransporter();
    }
  }

  /**
   * Setup real email transporter for production
   */
  /**
   * Setup real email transporter for production
   */
  async setupRealTransporter() {
    try {
      console.log('📧 Setting up real email transporter...');
      // Gmail displays app passwords with spaces ("xxxx xxxx xxxx xxxx")
      // but SMTP rejects them — strip all whitespace first.
      const appPassword = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');
      this.transporter = nodemailer.createTransport({
        service: 'gmail', // You can change this to other services
        auth: {
          user: process.env.EMAIL_USER,
          pass: appPassword, // Use App Password for Gmail
        },
      });
      console.log('📧 Real email transporter configured successfully');
      console.log('📧 Email service:', process.env.EMAIL_USER);

      // Test the configuration
      await this.testEmailConfiguration();
    } catch (error) {
      console.error('❌ Error setting up real email transporter:', error);
      // Fallback to test transporter
      this.setupTestTransporter();
    }
  }

  /**
   * Setup test email transporter for development
   */
  async setupTestTransporter() {
    try {
      console.log('📧 Setting up test email transporter...');
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log('📧 Test email transporter configured successfully');
      console.log('📧 Test account:', testAccount.user);
    } catch (error) {
      console.error('❌ Error setting up test email transporter:', error);
      // Fallback to a simple transporter that logs emails
      this.transporter = {
        sendMail: async (mailOptions) => {
          console.log('📧 [MOCK EMAIL] Would send email:');
          console.log('   To:', mailOptions.to);
          console.log('   Subject:', mailOptions.subject);
          console.log('   From:', mailOptions.from);
          return { messageId: 'mock-' + Date.now() };
        }
      };
    }
  }

  /**
   * Test email configuration
   * @returns {Promise<boolean>} Configuration test result
   */
  async testEmailConfiguration() {
    try {
      console.log('📧 Testing email configuration...');

      // Check if transporter has verify method (real transporter)
      if (this.transporter && typeof this.transporter.verify === 'function') {
        await this.transporter.verify();
        console.log('✅ Email configuration is valid');
        return true;
      } else {
        // Mock transporter or test transporter
        console.log('📧 Using test/mock email transporter');
        return true;
      }
    } catch (error) {
      console.error('❌ Email configuration test failed:', error.message);
      return false;
    }
  }

  /**
   * Generate email verification token
   * @returns {string} Verification token
   */
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Send email verification email
   * @param {string} email - User's email address
   * @param {string} firstName - User's first name
   * @param {string} token - Verification token
   * @returns {Promise<{success: boolean, previewUrl: string|null}>} Success status and optional preview URL
   */
  async sendVerificationEmail(email, firstName, token) {
    try {
      console.log('📧 [EmailService] Preparing verification email for:', email);
      const verificationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
      console.log('📧 [EmailService] Verification URL:', verificationUrl);

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'VitalMatch <noreply@vitalmatch.com>',
        to: email,
        subject: 'Verify Your VitalMatch Account',
        html: this.getVerificationEmailTemplate(firstName, verificationUrl)
      };

      console.log('📧 [EmailService] Sending email with options:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      const info = await this.transporter.sendMail(mailOptions);
      console.log('📧 [EmailService] Email sent successfully:', info.messageId);

      let previewUrl = null;

      // For development, log and return the preview URL
      const testUrl = nodemailer.getTestMessageUrl(info);
      if (testUrl) {
        console.log('📧 Verification email sent! Preview URL: %s', testUrl);
        previewUrl = testUrl;
      }

      return { success: true, previewUrl };
    } catch (error) {
      console.error('❌ [EmailService] Error sending verification email:', error);
      return { success: false, previewUrl: null };
    }
  }

  /**
   * Send password reset email
   * @param {string} email - User's email address
   * @param {string} firstName - User's first name
   * @param {string} token - Password reset token
   * @returns {Promise<{success: boolean, previewUrl: string|null}>} Success status and optional preview URL
   */
  async sendPasswordResetEmail(email, firstName, token) {
    try {
      const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password/${token}`;

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'VitalMatch <noreply@vitalmatch.com>',
        to: email,
        subject: 'Reset Your VitalMatch Password',
        html: `<h2>Hello ${firstName},</h2>
          <p>We received a request to reset your VitalMatch password. Click the link below to choose a new password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Reset My Password</a></p>
          <p>Or copy this link into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you did not request this, you can safely ignore this email.</p>`
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('📧 Password reset email sent:', info.messageId);

      return { success: true, previewUrl: nodemailer.getTestMessageUrl(info) || null };
    } catch (error) {
      console.error('❌ [EmailService] Error sending password reset email:', error);
      return { success: false, previewUrl: null };
    }
  }

  /**
   * Send welcome email after verification
   * @param {string} email - User's email address
   * @param {string} firstName - User's first name
   * @returns {Promise<boolean>} Success status
   */
  async sendWelcomeEmail(email, firstName) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'VitalMatch <noreply@vitalmatch.com>',
        to: email,
        subject: 'Welcome to VitalMatch!',
        html: this.getWelcomeEmailTemplate(firstName)
      };

      const info = await this.transporter.sendMail(mailOptions);

      let previewUrl = null;
      const testUrl = nodemailer.getTestMessageUrl(info);
      if (testUrl) {
        console.log('📧 Welcome email sent! Preview URL: %s', testUrl);
        previewUrl = testUrl;
      }

      return { success: true, previewUrl };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return { success: false, previewUrl: null };
    }
  }

  async sendNearbyRequestEmail(email, donorName, request, distanceText) {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'VitalMatch <noreply@vitalmatch.com>',
        to: email,
        subject: `VitalMatch - ${request.urgency} blood request nearby`,
        html: `<h2>Hello ${donorName},</h2>
          <p>A matching <strong>${request.bloodType}</strong> blood request is ${distanceText}.</p>
          <p><strong>Hospital:</strong> ${request.hospitalName}</p>
          <p><strong>Address:</strong> ${request.hospitalAddress}, ${request.city}, ${request.province}</p>
          <p><strong>Units needed:</strong> ${request.unitsRequired}</p>
          <p>Please sign in to VitalMatch to review the request and contact the Red Cross team.</p>`
      });

      return { success: true, previewUrl: nodemailer.getTestMessageUrl(info) || null };
    } catch (error) {
      console.error('Error sending nearby request email:', error);
      return { success: false, previewUrl: null };
    }
  }

  /**
   * Send donation schedule email to assigned donor
   * @param {string} email - Donor's email address
   * @param {string} firstName - Donor's name
   * @param {object} request - Blood request details
   * @param {string} scheduledDate - Scheduled date and time
   * @param {string} notes - Additional notes
   * @returns {Promise<boolean>} Success status
   */
  async sendDonationScheduleEmail(email, firstName, request, scheduledDate, notes, confirmUrl = null) {
    try {
      const formattedDate = scheduledDate ? new Date(scheduledDate).toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : 'As soon as possible';

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'VitalMatch <noreply@vitalmatch.com>',
        to: email,
        subject: 'VitalMatch - Blood Donation Scheduled',
        html: this.getDonationScheduleTemplate(firstName, request, formattedDate, notes, confirmUrl)
      };

      const info = await this.transporter.sendMail(mailOptions);

      let previewUrl = null;
      const testUrl = nodemailer.getTestMessageUrl(info);
      if (testUrl) {
        console.log('📧 Schedule email sent! Preview URL: %s', testUrl);
        previewUrl = testUrl;
      }

      return { success: true, previewUrl };
    } catch (error) {
      console.error('Error sending schedule email:', error);
      return { success: false, previewUrl: null };
    }
  }

  /**
   * Send schedule email to the original requester
   * @param {string} email - Requester's email address
   * @param {string} firstName - Requester's name
   * @param {object} request - Blood request details
   * @param {string} scheduledDate - Scheduled date and time
   * @param {string} notes - Additional notes
   * @returns {Promise<boolean>} Success status
   */
  async sendRequesterScheduleEmail(email, firstName, request, scheduledDate, notes, confirmUrl = null) {
    try {
      const formattedDate = scheduledDate ? new Date(scheduledDate).toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : 'As soon as possible';

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'VitalMatch <noreply@vitalmatch.com>',
        to: email,
        subject: 'VitalMatch - Your Request is Scheduled',
        html: this.getRequesterScheduleTemplate(firstName, request, formattedDate, notes, confirmUrl)
      };

      const info = await this.transporter.sendMail(mailOptions);

      let previewUrl = null;
      const testUrl = nodemailer.getTestMessageUrl(info);
      if (testUrl) {
        console.log('📧 Requester schedule email sent! Preview URL: %s', testUrl);
        previewUrl = testUrl;
      }

      return { success: true, previewUrl };
    } catch (error) {
      console.error('Error sending requester schedule email:', error);
      return { success: false, previewUrl: null };
    }
  }

  /**
   * Get email verification template
   * @param {string} firstName - User's first name
   * @param {string} verificationUrl - Verification URL
   * @returns {string} HTML email template
   */
  getVerificationEmailTemplate(firstName, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your VitalMatch Account</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 VitalMatch</h1>
            <p>Blood Donation System</p>
          </div>
          <div class="content">
            <h2>Welcome to VitalMatch, ${firstName}!</h2>
            <p>Thank you for registering with VitalMatch, the smart blood donation system that connects donors with those in need.</p>
            <p>To complete your registration and activate your account, please verify your email address by clicking the button below:</p>
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify My Email</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #e5e5e5; padding: 10px; border-radius: 4px;">${verificationUrl}</p>
            <p><strong>This verification link will expire in 24 hours.</strong></p>
            <p>If you didn't create an account with VitalMatch, please ignore this email.</p>
            <hr>
            <p><strong>Why verify your email?</strong></p>
            <ul>
              <li>Secure your account</li>
              <li>Receive important notifications about blood donation opportunities</li>
              <li>Get updates on your donation requests</li>
              <li>Connect with the VitalMatch community</li>
            </ul>
          </div>
          <div class="footer">
            <p>© 2025 VitalMatch. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get welcome email template
   * @param {string} firstName - User's first name
   * @returns {string} HTML email template
   */
  getWelcomeEmailTemplate(firstName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to VitalMatch!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #dc2626; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 Welcome to VitalMatch!</h1>
            <p>Your account is now active</p>
          </div>
          <div class="content">
            <h2>Congratulations, ${firstName}!</h2>
            <p>Your email has been successfully verified and your VitalMatch account is now active. You're now part of a community that saves lives through blood donation.</p>
            
            <div style="text-align: center;">
              <a href="${process.env.BASE_URL || 'http://localhost:3000'}/dashboard" class="button">Go to Dashboard</a>
            </div>
            
            <h3>What you can do now:</h3>
            
            <div class="feature">
              <h4>🩸 Request Blood</h4>
              <p>Submit blood requests for yourself or others in need</p>
            </div>
            
            <div class="feature">
              <h4>❤️ Become a Donor</h4>
              <p>Register as a blood donor and help save lives in your community</p>
            </div>
            
            <div class="feature">
              <h4>📱 Stay Connected</h4>
              <p>Receive notifications about donation opportunities and urgent requests</p>
            </div>
            
            <div class="feature">
              <h4>📊 Track Your Impact</h4>
              <p>Monitor your donations and see the lives you've helped save</p>
            </div>
            
            <p>Thank you for joining VitalMatch. Together, we can make a difference and save lives!</p>
          </div>
          <div class="footer">
            <p>© 2025 VitalMatch. All rights reserved.</p>
            <p>Need help? Contact us at support@vitalmatch.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get donation schedule email template
   * @param {string} firstName - Donor's first name
   * @param {object} request - Request details
   * @param {string} formattedDate - Formatted scheduled date
   * @param {string} notes - Additional instructions
   * @returns {string} HTML email template
   */
  getDonationScheduleTemplate(firstName, request, formattedDate, notes, confirmUrl = null) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VitalMatch - Donation Scheduled</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .info-box { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #dc2626; }
          .info-box p { margin: 5px 0; }
          .info-box strong { color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 VitalMatch</h1>
            <p>Donation Scheduled</p>
          </div>
          <div class="content">
            <h2>Hello ${firstName},</h2>
            <p>Thank you for your willingness to donate! A blood donation has been scheduled for you based on a matching request.</p>
            
            <div class="info-box">
              <h3 style="margin-top:0;">Donation Details</h3>
              <p><strong>Scheduled Date & Time:</strong> ${formattedDate}</p>
              <p><strong>Hospital / Location:</strong> ${request.hospitalName}</p>
              <p><strong>Address:</strong> ${request.hospitalAddress}, ${request.city}, ${request.province}</p>
              <p><strong>Patient's Blood Type Needed:</strong> ${request.bloodType}</p>
              <p><strong>Units Required:</strong> ${request.unitsRequired}</p>
            </div>
            
            ${notes ? `
            <div class="info-box" style="border-left-color: #f59e0b;">
              <h3 style="margin-top:0;">Additional Instructions</h3>
              <p>${notes.replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}
            
            <p><strong>Before your donation:</strong></p>
            <ul>
              <li>Drink plenty of water before your appointment.</li>
              <li>Eat a healthy, low-fat meal.</li>
              <li>Bring a valid photo ID.</li>
              <li>Wear a shirt with sleeves that can be easily rolled up.</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/confirm-schedule/${request.id}/donor`}" style="display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Confirm My Availability</a>
            </div>
            
            <p>If you are unable to make this appointment, please contact the admin team as soon as possible through the VitalMatch portal.</p>
            <p>Thank you for being a hero and saving lives!</p>
          </div>
          <div class="footer">
            <p>© 2025 VitalMatch. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get requester schedule email template
   * @param {string} firstName - Requester's first name
   * @param {object} request - Request details
   * @param {string} formattedDate - Formatted scheduled date
   * @param {string} notes - Additional instructions
   * @returns {string} HTML email template
   */
  getRequesterScheduleTemplate(firstName, request, formattedDate, notes, confirmUrl = null) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VitalMatch - Request Scheduled</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .info-box { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #dc2626; }
          .info-box p { margin: 5px 0; }
          .info-box strong { color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 VitalMatch</h1>
            <p>Your Request is Scheduled</p>
          </div>
          <div class="content">
            <h2>Hello ${firstName},</h2>
            <p>Good news! Your blood request has been successfully scheduled for fulfillment.</p>
            
            <div class="info-box">
              <h3 style="margin-top:0;">Fulfillment Details</h3>
              <p><strong>Scheduled Date & Time:</strong> ${formattedDate}</p>
              <p><strong>Hospital / Location:</strong> ${request.hospitalName}</p>
              <p><strong>Patient Name:</strong> ${request.patientName}</p>
              <p><strong>Blood Type:</strong> <span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-weight:bold;">${request.bloodType}</span></p>
              <p><strong>Units Provided:</strong> ${request.unitsRequired}</p>
            </div>
            
            ${notes ? `
            <div class="info-box" style="border-left-color: #3b82f6;">
              <h3 style="margin-top:0;">Message from Admin</h3>
              <p>${notes.replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/confirm-schedule/${request.id}/requester`}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Confirm Appointment Details</a>
            </div>
            
            <p>Please make sure to coordinate with the hospital regarding the specific blood transfusion arrangements.</p>
            <p>Thank you for using VitalMatch!</p>
          </div>
          <div class="footer">
            <p>© 2025 VitalMatch. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

// Create singleton instance
export const emailService = new EmailService();