#!/usr/bin/env node

/*
 * Interactive Email Setup Script
 * Run this to configure real email sending for VitalMatch
 */

import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupEmail() {
  console.log('🩸 VitalMatch Email Configuration Setup\n');
  console.log('This will help you configure real email sending for user registration verification.\n');
  
  console.log('📧 Current Status:');
  console.log('   - Email verification system: ✅ Implemented');
  console.log('   - Test emails (fake): ✅ Working');
  console.log('   - Real email delivery: ❌ Not configured\n');
  
  const choice = await question('Do you want to set up real email delivery? (y/n): ');
  
  if (choice.toLowerCase() !== 'y' && choice.toLowerCase() !== 'yes') {
    console.log('\n📧 Keeping test email configuration.');
    console.log('   Emails will be sent to fake inbox (Ethereal Email)');
    console.log('   Users won\'t receive actual emails.');
    rl.close();
    return;
  }
  
  console.log('\n🔧 Setting up Gmail SMTP...\n');
  console.log('📋 Prerequisites:');
  console.log('   1. Gmail account with 2-Step Verification enabled');
  console.log('   2. App Password generated (not your regular password)\n');
  
  const hasPrerequisites = await question('Do you have these prerequisites? (y/n): ');
  
  if (hasPrerequisites.toLowerCase() !== 'y' && hasPrerequisites.toLowerCase() !== 'yes') {
    console.log('\n📖 Setup Guide:');
    console.log('   1. Go to https://myaccount.google.com/security');
    console.log('   2. Enable "2-Step Verification"');
    console.log('   3. Go to "App passwords" section');
    console.log('   4. Generate password for "Mail"');
    console.log('   5. Copy the 16-character password');
    console.log('   6. Run this script again\n');
    rl.close();
    return;
  }
  
  console.log('\n📝 Enter your Gmail credentials:\n');
  
  const email = await question('Gmail address: ');
  const appPassword = await question('App Password (16 characters): ');
  const fromName = await question('From name (default: VitalMatch): ') || 'VitalMatch';
  
  // Validate inputs
  if (!email.includes('@gmail.com')) {
    console.log('❌ Please enter a valid Gmail address');
    rl.close();
    return;
  }
  
  if (appPassword.replace(/\s/g, '').length !== 16) {
    console.log('❌ App Password should be 16 characters (spaces will be removed)');
    rl.close();
    return;
  }
  
  // Create .env content
  const envContent = `# Email Configuration
# Gmail SMTP Configuration
EMAIL_USER=${email}
EMAIL_PASS=${appPassword.replace(/\s/g, '')}
EMAIL_FROM=${fromName} <noreply@vitalmatch.com>
BASE_URL=http://localhost:3000

# Set to development for test emails, production for real emails
NODE_ENV=development

# Database Configuration (if needed)
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=vitalmatch`;

  // Write .env file
  fs.writeFileSync('.env', envContent);
  
  console.log('\n✅ Email configuration saved to .env file!');
  console.log('\n🧪 Testing configuration...\n');
  
  // Test the configuration
  try {
    const { execSync } = await import('child_process');
    execSync('node testEmail.js', { stdio: 'inherit' });
    
    console.log('\n🎉 Setup complete!');
    console.log('\n📧 Next steps:');
    console.log('   1. Start the server: npm run xian');
    console.log('   2. Test registration at http://localhost:3000/register');
    console.log('   3. Check your email for verification message');
    console.log('\n💡 Tip: Send a test email with:');
    console.log(`   node testEmail.js test-send ${email}`);
    
  } catch (error) {
    console.log('\n❌ Configuration test failed. Please check your credentials.');
    console.log('   You can manually test with: node testEmail.js');
  }
  
  rl.close();
}

setupEmail().catch(console.error);