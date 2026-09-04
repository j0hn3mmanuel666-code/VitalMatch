/*
  Script to create a test admin user
*/

import bcrypt from 'bcrypt';
import { User, sequelize } from './models/userModel.js';

async function createTestAdmin() {
  try {
    await sequelize.sync();
    
    const testEmail = 'test.admin@vitalmatch.com';
    const testPassword = 'TestAdmin123!';
    
    // Check if admin already exists
    const existing = await User.findOne({ where: { email: testEmail } });
    
    if (existing) {
      console.log('✅ Admin already exists');
      console.log('📧 Email:', testEmail);
      console.log('🔑 Password:', testPassword);
      console.log('\n✨ Access settings at: http://localhost:3000/admin/settings');
      process.exit(0);
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    
    // Create admin user
    const admin = await User.create({
      firstName: 'Test',
      lastName: 'Admin',
      email: testEmail,
      password: hashedPassword,
      phone: '+63-999-999-9999',
      address: 'Admin Building, Calapan City',
      dateOfBirth: '1990-01-01',
      gender: 'Other',
      role: 'admin'
    });
    
    console.log('✅ Test admin user created successfully!');
    console.log('📧 Email:', testEmail);
    console.log('🔑 Password:', testPassword);
    console.log('\n✨ Access settings at: http://localhost:3000/admin/settings');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestAdmin();
