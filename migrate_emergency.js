import { sequelize } from "./models/db.js";

async function ensureColumn(col, def) {
  const db = sequelize.getDatabaseName();
  const [cols] = await sequelize.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?", { replacements: [db, "BloodRequests", col] });
  if (cols.length > 0) { console.log("exists: " + col); return; }
  await sequelize.query("ALTER TABLE `BloodRequests` ADD COLUMN `" + col + "` " + def);
  console.log("added: " + col);
}

async function main() {
  await ensureColumn("isEmergency", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("emergencyAt", "DATETIME NULL");
  await ensureColumn("emergencyExpiresAt", "DATETIME NULL");
  await sequelize.close();
}

main().catch(function (e) { console.error("MIGRATE FAILED:", e.message); process.exit(1); });
