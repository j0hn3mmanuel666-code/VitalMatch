import { sequelize } from './models/db.js';
import { BloodRequest } from './models/bloodRequestModel.js';

async function testUpdate() {
  try {
    await sequelize.authenticate();
    const req = await BloodRequest.findOne();
    if (!req) {
      console.log("No requests found");
      return;
    }
    
    console.log("Found request:", req.id);
    
    await req.update({
      status: 'scheduled',
      assignedDonorId: 1,
      scheduledDate: new Date("06/06/2026 10:00 AM"),
      fulfillmentNotes: "and then"
    });
    
    console.log("Update successful!");
    
  } catch (err) {
    console.error("Error during update:", err);
  } finally {
    process.exit();
  }
}

testUpdate();
