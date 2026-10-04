import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const CallForDonation = sequelize.define("CallForDonation", {
  fullName: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'RESTRICT' },
  contactNotes: { type: DataTypes.TEXT, allowNull: true },
  contactedAt: { type: DataTypes.DATE, allowNull: true },
  contactedBy: { type: DataTypes.INTEGER, allowNull: true },
  convertedUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'RESTRICT' },
  convertedAt: { type: DataTypes.DATE, allowNull: true },
  age: { type: DataTypes.INTEGER, allowNull: false },
  weight: { type: DataTypes.STRING, allowNull: false },
  bloodType: { type: DataTypes.STRING, allowNull: false },
  gender: { type: DataTypes.STRING, allowNull: false },
  contactNumber: { type: DataTypes.STRING, allowNull: false },
  hasTattoo: { type: DataTypes.STRING, allowNull: false },
  location: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: "Pending" } // Pending, Reviewed, Contacted
});
