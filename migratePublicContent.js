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

import 'dotenv/config';
import { PublicContent } from './models/publicContentModel.js';
import { sequelize } from './models/db.js';

const migratePublicContent = async () => {
  try {
    console.log('🔄 Starting public content migration...');

    // Sync the model with the database
    await PublicContent.sync({ alter: true });
    console.log('✅ PublicContent table created/updated successfully');

    // Seed default content sections if they don't exist
    const heroContent = await PublicContent.findOne({ where: { section: 'hero' } });
    if (!heroContent) {
      await PublicContent.create({
        section: 'hero',
        title: 'Ready to Save Lives?',
        subtitle: 'Smart Blood Request Platform',
        description: 'Join the Philippine Red Cross - Mindoro Chapter in making blood donation coordination faster and more efficient.',
        primaryButtonText: 'Request Blood',
        primaryButtonLink: '/request-blood',
        secondaryButtonText: 'Become a Donor',
        secondaryButtonLink: '/register',
        isActive: true
      });
      console.log('✅ Seeded hero section content');
    }

    const callForDonationContent = await PublicContent.findOne({ where: { section: 'callForDonation' } });
    if (!callForDonationContent) {
      await PublicContent.create({
        section: 'callForDonation',
        title: 'Call for Blood Donation',
        description: 'Are you organizing a blood drive or urgently need donors for a patient? Submit a call for donation and our team will coordinate with you.',
        primaryButtonText: 'Submit a Call for Donation',
        primaryButtonLink: '/request-blood',
        isActive: true
      });
      console.log('✅ Seeded call for donation section content');
    }

    const aboutContent = await PublicContent.findOne({ where: { section: 'about' } });
    if (!aboutContent) {
      await PublicContent.create({
        section: 'about',
        title: 'About VitalMatch',
        description: 'VitalMatch is a web-based blood request and donor matching system designed to assist the Philippine Red Cross in improving emergency blood coordination and response time.',
        isActive: true
      });
      console.log('✅ Seeded about section content');
    }

    console.log('✨ Public content migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

migratePublicContent();
