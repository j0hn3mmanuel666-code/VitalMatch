import { sequelize } from "./models/db.js";

const FKS = [
  { table: "Donors", column: "userId", refTable: "Users", refColumn: "id", action: "CASCADE", name: "fk_donors_user" },
  { table: "BloodRequests", column: "userId", refTable: "Users", refColumn: "id", action: "CASCADE", name: "fk_requests_user" },
  { table: "BloodRequests", column: "assignedDonorId", refTable: "Donors", refColumn: "id", action: "SET NULL", name: "fk_requests_donor" },
  { table: "Notifications", column: "userId", refTable: "Users", refColumn: "id", action: "CASCADE", name: "fk_notifications_user" },
  { table: "Messages", column: "senderId", refTable: "Users", refColumn: "id", action: "CASCADE", name: "fk_messages_sender" },
  { table: "Messages", column: "receiverId", refTable: "Users", refColumn: "id", action: "CASCADE", name: "fk_messages_receiver" },
  { table: "UserSettings", column: "userId", refTable: "Users", refColumn: "id", action: "CASCADE", name: "fk_settings_user" },
  { table: "Calls", column: "callerId", refTable: "Users", refColumn: "id", action: "CASCADE", name: "fk_calls_caller" },
  { table: "Calls", column: "calleeId", refTable: "Users", refColumn: "id", action: "CASCADE", name: "fk_calls_callee" }
];

const UNIQUES = [
  { table: "Donors", column: "userId", name: "uniq_donors_user" }
];

async function main() {
  const dbName = sequelize.getDatabaseName();

  const [bad] = await sequelize.query("SELECT id FROM BloodRequests WHERE assignedDonorId IS NOT NULL AND assignedDonorId NOT IN (SELECT id FROM Donors)");
  if (bad.length > 0) {
    await sequelize.query("UPDATE BloodRequests SET assignedDonorId = NULL WHERE assignedDonorId IS NOT NULL AND assignedDonorId NOT IN (SELECT id FROM Donors)");
    console.log("Fixed " + bad.length + " dangling assignedDonorId");
  }

  for (const fk of FKS) {
    const [exists] = await sequelize.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?", { replacements: [dbName, fk.table, fk.name] });
    if (exists.length > 0) { console.log("exists: " + fk.name); continue; }
    await sequelize.query("ALTER TABLE `" + fk.table + "` ADD CONSTRAINT `" + fk.name + "` FOREIGN KEY (`" + fk.column + "`) REFERENCES `" + fk.refTable + "` (`" + fk.refColumn + "`) ON DELETE " + fk.action);
    console.log("added: " + fk.name);
  }

  for (const u of UNIQUES) {
    const [exists] = await sequelize.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?", { replacements: [u.table, u.table, u.name] });
    if (exists.length > 0) { console.log("exists: " + u.name); continue; }
    await sequelize.query("ALTER TABLE `" + u.table + "` ADD UNIQUE KEY `" + u.name + "` (`" + u.column + "`)");
    console.log("added: " + u.name);
  }

  const [all] = await sequelize.query("SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? ORDER BY TABLE_NAME", { replacements: [dbName] });
  console.log("--- FKs now on database ---");
  all.forEach(function (r) { console.log(r.TABLE_NAME + " . " + r.CONSTRAINT_NAME + " -> " + r.DELETE_RULE); });
  await sequelize.close();
}

main().catch(function (e) { console.error("MIGRATE FAILED:", e.message); process.exit(1); });
