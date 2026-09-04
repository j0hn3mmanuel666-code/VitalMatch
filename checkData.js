import { BloodRequest } from "./models/bloodRequestModel.js";
import { Donor } from "./models/donorModel.js";
import { User } from "./models/userModel.js";
import { sequelize } from "./models/db.js";

async function checkData() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");
    
    // Check blood requests
    const requests = await BloodRequest.findAll();
    console.log("\n📋 Blood Requests:");
    requests.forEach(req => {
      console.log(`- ID: ${req.id}, Patient: ${req.patientName}, Blood Type: ${req.bloodType}, Status: ${req.status}`);
    });
    
    // Check donors
    const donors = await Donor.findAll();
    console.log("\n👥 Donors:");
    donors.forEach(donor => {
      console.log(`- ID: ${donor.id}, Name: ${donor.fullName}, Blood Type: ${donor.bloodType}, Available: ${donor.isAvailable}, UserID: ${donor.userId}`);
    });
    
    // Check users
    const users = await User.findAll();
    console.log("\n👤 Users:");
    users.forEach(user => {
      console.log(`- ID: ${user.id}, Name: ${user.firstName} ${user.lastName}, Email: ${user.email}, Role: ${user.role}`);
    });
    
    // Check for matches
    console.log("\n🔍 Checking for matches:");
    for (const request of requests) {
      const matchingDonors = await Donor.findAll({
        where: {
          bloodType: request.bloodType,
          isAvailable: true
        }
      });
      console.log(`Request ${request.id} (${request.bloodType}): ${matchingDonors.length} matching donors`);
      matchingDonors.forEach(donor => {
        console.log(`  - ${donor.fullName} (UserID: ${donor.userId})`);
      });
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

checkData();