import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Yearly counter for system-generated patient reference numbers.
// One row per calendar year (Asia/Manila): { year: 2026, lastSequence: 41 }.
// The counter row is locked (SELECT ... FOR UPDATE) inside the same
// transaction that creates the blood request, so concurrent submissions
// can never receive the same reference number.
export const ReferenceCounter = sequelize.define("ReferenceCounter", {
  year: { type: DataTypes.INTEGER, primaryKey: true },
  lastSequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
});

export { sequelize };
