import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const PasswordReset = sequelize.define("PasswordReset", {
  email: { type: DataTypes.STRING, allowNull: false },
  token: { type: DataTypes.STRING, allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  used: { type: DataTypes.BOOLEAN, defaultValue: false }
});

export { sequelize };
