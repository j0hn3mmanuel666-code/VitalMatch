import { sequelize } from "./models/db.js";

async function main() {
  const db = sequelize.getDatabaseName();
  const [cols] = await sequelize.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?", { replacements: [db, "Users", "hospitalName"] });
  if (cols.length > 0) {
    console.log("exists: Users.hospitalName");
  } else {
    await sequelize.query("ALTER TABLE `Users` ADD COLUMN `hospitalName` VARCHAR(255) NULL");
    console.log("added: Users.hospitalName");
  }
  await sequelize.close();
}

main().catch(function (e) { console.error("MIGRATE FAILED:", e.message); process.exit(1); });
