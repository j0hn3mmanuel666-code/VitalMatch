import { sequelize } from "./models/db.js";

async function alterTable() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");
    
    // Check if column exists, if not add it
    try {
      await sequelize.query('ALTER TABLE BloodRequests ADD COLUMN requesterConfirmed TINYINT(1) DEFAULT 0;');
      console.log("✅ Added requesterConfirmed column");
    } catch (e) {
      console.log("Column requesterConfirmed might already exist: ", e.message);
    }
    
    try {
      await sequelize.query('ALTER TABLE BloodRequests ADD COLUMN donorConfirmed TINYINT(1) DEFAULT 0;');
      console.log("✅ Added donorConfirmed column");
    } catch (e) {
      console.log("Column donorConfirmed might already exist: ", e.message);
    }
    
  } catch (err) {
    console.error("❌ Alter failed:", err);
  } finally {
    process.exit();
  }
}

alterTable();
