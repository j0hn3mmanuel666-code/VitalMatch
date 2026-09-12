import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { BloodRequest } from "./bloodRequestModel.js";

// A donor pledge to donate for a request. One active pledge per user per request.
export const Pledge = sequelize.define("Pledge", {
  requestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: "pledge_once",
    references: { model: BloodRequest, key: "id" },
    onDelete: "CASCADE"
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: "pledge_once",
    references: { model: User, key: "id" },
    onDelete: "CASCADE"
  },
  bloodType: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: "pending" }
});

Pledge.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE" });
Pledge.belongsTo(BloodRequest, { foreignKey: "requestId", onDelete: "CASCADE" });

// Donor blood type -> recipient blood types it can donate to
export const COMPATIBLE = {
  "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
  "O+": ["O+", "A+", "B+", "AB+"],
  "A-": ["A-", "A+", "AB-", "AB+"],
  "A+": ["A+", "AB+"],
  "B-": ["B-", "B+", "AB-", "AB+"],
  "B+": ["B+", "AB+"],
  "AB-": ["AB-", "AB+"],
  "AB+": ["AB+"]
};

export function isCompatible(donorType, recipientType) {
  const list = COMPATIBLE[String(donorType || "").toUpperCase()];
  return !!list && list.includes(String(recipientType || "").toUpperCase());
}

export { sequelize };
