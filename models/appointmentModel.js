import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';
import { BloodRequest } from './bloodRequestModel.js';
import { Donor } from './donorModel.js';

export const Appointment = sequelize.define('Appointment', {
  requestId: { type: DataTypes.INTEGER, allowNull: false, references: { model: BloodRequest, key: 'id' }, onDelete: 'RESTRICT' },
  donorId: { type: DataTypes.INTEGER, allowNull: true, references: { model: Donor, key: 'id' }, onDelete: 'RESTRICT' },
  scheduledDate: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  donorConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  requesterConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
  createdBy: { type: DataTypes.INTEGER, allowNull: true } // legacy actor may be unknown; new operations always provide it
}, { indexes: [{ fields: ['requestId', 'status'] }, { fields: ['donorId', 'status', 'scheduledDate'] }] });
Appointment.belongsTo(BloodRequest, { foreignKey: 'requestId', onDelete: 'RESTRICT' });
Appointment.belongsTo(Donor, { foreignKey: 'donorId', onDelete: 'RESTRICT' });
