import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';

// Only administrators assign this stable identity to hospital accounts.
export const Facility = sequelize.define('Facility', {
  hospitalName: { type: DataTypes.STRING, allowNull: false, unique: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  verifiedAt: { type: DataTypes.DATE, allowNull: true },
  verifiedBy: { type: DataTypes.INTEGER, allowNull: true }
});
