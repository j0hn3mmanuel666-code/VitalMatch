import { sequelize } from './models/db.js';
import { BloodRequest } from './models/bloodRequestModel.js';
import { Donor } from './models/donorModel.js';
import { vitalMatchBlockchain } from './services/blockchainService.js';

async function testFulfillLogic() {
  try {
    const requestId = 18; // Use an existing request ID
    const donorId = "1";
    const unitsProvided = 1;
    const scheduledDate = "06/06/2026 10:00 AM";
    const notes = "and then";
    const userId = 1; // req.session.userId

    const request = await BloodRequest.findByPk(requestId);
    
    let newStatus = 'fulfilled';
    let isScheduled = false;
    
    if (scheduledDate) {
      const scheduleTime = new Date(scheduledDate);
      if (scheduleTime > new Date()) {
        newStatus = 'scheduled';
        isScheduled = true;
      }
    }
    
    const parsedDonorId = donorId ? parseInt(donorId) : null;
    
    await request.update({ 
      status: newStatus,
      assignedDonorId: parsedDonorId,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      fulfillmentNotes: notes || null
    });
    
    console.log("update success");

    vitalMatchBlockchain.addFulfillmentRecord(requestId, parsedDonorId || 'admin-fulfilled', {
      units: unitsProvided || request.unitsRequired,
      matchingScore: 100, // Perfect match for admin fulfillment
      fulfillmentDate: scheduledDate || new Date().toISOString(),
      notes: notes || '',
      verifiedBy: userId
    });
    
    console.log("blockchain success");

    vitalMatchBlockchain.minePendingTransactions();
    
    if (parsedDonorId) {
        console.log("sending donor email");
        const donor = await Donor.findByPk(parsedDonorId);
        if (donor && donor.email) {
          const { emailService } = await import('./services/emailService.js');
          await emailService.sendDonationScheduleEmail(
            donor.email, 
            donor.fullName, 
            request, 
            scheduledDate,
            notes
          );
        }
    }
    
    if (request.email) {
        console.log("sending requester email");
        const { emailService } = await import('./services/emailService.js');
        await emailService.sendRequesterScheduleEmail(
          request.email,
          request.contactPerson,
          request,
          scheduledDate,
          notes
        );
    }
    
    console.log("DONE!");
  } catch (err) {
    console.error("CRASH:", err);
  } finally {
    process.exit();
  }
}

testFulfillLogic();
