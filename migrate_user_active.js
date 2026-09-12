import { sequelize } from "./models/db.js";

async function main() {
  const db = sequelize.getDatabaseName();
  const [cols] = await sequelize.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?", { replacements: [db, "Users", "isActive"] });
  if (cols.length > 0) {
    console.log("exists: Users.isActive");
  } else {
    await sequelize.query("ALTER TABLE `Users` ADD COLUMN `isActive` TINYINT(1) NOT NULL DEFAULT 1");
    console.log("added: Users.isActive (default active, existing users unaffected)");
  }
  await sequelize.close();
}

main().catch(function (e) { console.error("MIGRATE FAILED:", e.message); process.exit(1); });
