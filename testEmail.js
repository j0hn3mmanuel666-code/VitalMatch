/*
 * Email Service Test Script
 * Run this to test if email configuration is working
 */

import 'dotenv/config';
import { emailService } from './services/emailService.js';

// Environment variables are now loaded before local imports

async function testEmailService() {
  console.log('🧪 Testing Email Service Configuration...\n');
  
  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Not set');
  console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ Set' : '❌ Not set');
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM || 'Using default');
  console.log('BASE_URL:', process.env.BASE_URL || 'Using default');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'Not set');
  console.log('');
  
  // Test email configuration
  const configValid = await emailService.testEmailConfiguration();
  
  if (configValid) {
    console.log('✅ Email configuration is valid!');
    
    // Ask if user wants to send a test email
    console.log('\n📧 To send a test verification email, update the .env file with:');
    console.log('1. Your Gmail address in EMAIL_USER');
    console.log('2. Your Gmail App Password in EMAIL_PASS');
    console.log('3. Run: node testEmail.js test-send your-email@example.com');
  } else {
    console.log('❌ Email configuration failed!');
    console.log('\n🔧 To fix this:');
    console.log('1. Update .env file with your Gmail credentials');
    console.log('2. For Gmail: Enable 2-Step Verification');
    console.log('3. Generate App Password: Google Account > Security > App passwords');
    console.log('4. Use the App Password (not your regular password) in EMAIL_PASS');
  }
}

async function sendTestEmail(testEmail) {
  console.log(`📧 Sending test verification email to: ${testEmail}`);
  
  const token = emailService.generateVerificationToken();
  const success = await emailService.sendVerificationEmail(testEmail, 'Test User', token);
  
  if (success) {
    console.log('✅ Test email sent successfully!');
    console.log('📬 Check your inbox (and spam folder) for the verification email');
  } else {
    console.log('❌ Failed to send test email');
  }
}

// Main execution
const args = process.argv.slice(2);
if (args[0] === 'test-send' && args[1]) {
  sendTestEmail(args[1]);
} else {
  testEmailService();
}