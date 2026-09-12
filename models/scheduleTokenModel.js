import { DataTypes } from "sequelize";
import crypto from "crypto";
import { sequelize } from "./db.js";
import { BloodRequest } from "./bloodRequestModel.js";

export const ScheduleToken = sequelize.define("ScheduleToken", {
  token: { type: DataTypes.STRING, allowNull: false, unique: true },
  bloodRequestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: BloodRequest, key: "id" },
    onDelete: "CASCADE"
  },
  role: { type: DataTypes.STRING, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  used: { type: DataTypes.BOOLEAN, defaultValue: false }
});

ScheduleToken.belongsTo(BloodRequest, { foreignKey: "bloodRequestId", onDelete: "CASCADE" });

// Single-use token, valid 7 days. Older unused tokens for the same side are invalidated.
export async function createScheduleToken(bloodRequestId, role, hoursValid = 168) {
  await ScheduleToken.update(
    { used: true },
    { where: { bloodRequestId, role, used: false } }
  );
  return ScheduleToken.create({
    token: crypto.randomBytes(32).toString("hex"),
    bloodRequestId,
    role,
    expiresAt: new Date(Date.now() + hoursValid * 3600000)
  });
}

export { sequelize };
