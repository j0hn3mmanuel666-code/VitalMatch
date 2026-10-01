import { DataTypes } from "sequelize";
import crypto from "crypto";
import { sequelize } from "./db.js";
import { BloodRequest } from "./bloodRequestModel.js";
import { hashToken } from "../middleware/validation.js";

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
// Only the hash is stored; the raw token is returned transiently on `.token`
// for outbound email links. Never save the instance afterwards (it would
// overwrite the hash with the raw token); use record.update({ used: true }).
export async function createScheduleToken(bloodRequestId, role, hoursValid = 168) {
  await ScheduleToken.update(
    { used: true },
    { where: { bloodRequestId, role, used: false } }
  );
  const rawToken = crypto.randomBytes(32).toString("hex");
  const record = await ScheduleToken.create({
    token: hashToken(rawToken),
    bloodRequestId,
    role,
    expiresAt: new Date(Date.now() + hoursValid * 3600000)
  });
  record.token = rawToken;
  return record;
}

export { sequelize };
