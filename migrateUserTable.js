/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { sequelize } from "./models/db.js";

async function migrateUserTable() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to MySQL database!");

    const queryInterface = sequelize.getQueryInterface();

    // Check if 'name' column exists
    const tableDescription = await queryInterface.describeTable('Users');
    
    if (tableDescription.name) {
      console.log("📝 Migrating User table structure...");
      
      // Add new columns if they don't exist
      if (!tableDescription.firstName) {
        await queryInterface.addColumn('Users', 'firstName', {
          type: sequelize.Sequelize.STRING,
          allowNull: true // Temporarily allow null
        });
        console.log("✅ Added firstName column");
      }
      
      if (!tableDescription.lastName) {
        await queryInterface.addColumn('Users', 'lastName', {
          type: sequelize.Sequelize.STRING,
          allowNull: true
        });
        console.log("✅ Added lastName column");
      }
      
      if (!tableDescription.phone) {
        await queryInterface.addColumn('Users', 'phone', {
          type: sequelize.Sequelize.STRING,
          allowNull: true
        });
        console.log("✅ Added phone column");
      }
      
      if (!tableDescription.address) {
        await queryInterface.addColumn('Users', 'address', {
          type: sequelize.Sequelize.TEXT,
          allowNull: true
        });
        console.log("✅ Added address column");
      }
      
      if (!tableDescription.dateOfBirth) {
        await queryInterface.addColumn('Users', 'dateOfBirth', {
          type: sequelize.Sequelize.DATEONLY,
          allowNull: true
        });
        console.log("✅ Added dateOfBirth column");
      }
      
      if (!tableDescription.gender) {
        await queryInterface.addColumn('Users', 'gender', {
          type: sequelize.Sequelize.STRING,
          allowNull: true
        });
        console.log("✅ Added gender column");
      }

      // Migrate existing data: split 'name' into firstName and lastName
      await sequelize.query(`
        UPDATE Users 
        SET firstName = SUBSTRING_INDEX(name, ' ', 1),
            lastName = SUBSTRING_INDEX(name, ' ', -1)
        WHERE name IS NOT NULL AND firstName IS NULL
      `);
      console.log("✅ Migrated name data to firstName and lastName");

      // Set default values for other fields
      await sequelize.query(`
        UPDATE Users 
        SET phone = '00000000000',
            address = 'Not provided',
            dateOfBirth = '2000-01-01',
            gender = 'Not specified'
        WHERE phone IS NULL OR address IS NULL OR dateOfBirth IS NULL OR gender IS NULL
      `);
      console.log("✅ Set default values for new fields");

      // Remove old 'name' column
      await queryInterface.removeColumn('Users', 'name');
      console.log("✅ Removed old name column");

      console.log("✅ Migration completed successfully!");
    } else {
      console.log("ℹ️ Table already has new structure, no migration needed");
    }

  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

migrateUserTable();
