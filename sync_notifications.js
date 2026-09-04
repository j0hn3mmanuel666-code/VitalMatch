import { Notification } from './models/notificationModel.js';
import { sequelize } from './models/db.js';

async function syncModel() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database.');
    
    await Notification.sync({ alter: true });
    console.log('✅ Notification table created/updated successfully!');
    
  } catch (err) {
    console.error('❌ Sync failed:', err);
  } finally {
    process.exit();
  }
}

syncModel();
