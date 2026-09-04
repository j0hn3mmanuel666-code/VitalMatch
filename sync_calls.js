import { CallForDonation } from './models/callForDonationModel.js';
import { sequelize } from './models/db.js';

async function syncModel() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database.');
    
    await CallForDonation.sync({ alter: true });
    console.log('✅ CallForDonation table created/updated successfully!');
    
  } catch (err) {
    console.error('❌ Sync failed:', err);
  } finally {
    process.exit();
  }
}

syncModel();
