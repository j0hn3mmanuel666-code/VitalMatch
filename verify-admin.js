/*
  Script to verify admin user email
*/

import { User, sequelize } from './models/userModel.js';

async function verifyAdminEmail() {
  try {
    await sequelize.sync();
    
    const testEmail = 'test.admin@vitalmatch.com';
    
    // Find and verify admin user
    const admin = await User.findOne({ where: { email: testEmail } });
    
    if (!admin) {
      console.log('❌ Admin user not found');
      process.exit(1);
    }
    
    // Update email verification
    await admin.update({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null
    });
    
    console.log('✅ Admin email verified successfully!');
    console.log('📧 Email:', testEmail);
    console.log('✨ You can now log in');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyAdminEmail();
