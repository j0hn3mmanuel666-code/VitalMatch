import { Notification } from './models/notificationModel.js';
import { sequelize } from './models/db.js';

async function seed() {
  try {
    await sequelize.authenticate();
    await Notification.create({
      userId: 15,
      title: 'Welcome to Notifications',
      message: 'Your notification system is now fully functional!',
      type: 'success',
      link: '/dashboard'
    });
    console.log('✅ Seeded notification for user 15');
  } catch (err) {
    console.error('❌ Failed:', err);
  } finally {
    process.exit();
  }
}

seed();
