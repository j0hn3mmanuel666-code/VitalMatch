import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';
import { User } from './userModel.js';

export const PushSubscription = sequelize.define('PushSubscription', {
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' }, onDelete: 'CASCADE' },
  expoPushToken: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  platform: { type: DataTypes.STRING(16), allowNull: false },
  disabledAt: { type: DataTypes.DATE, allowNull: true },
  lastRegisteredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { indexes: [{ fields: ['userId', 'disabledAt'] }] });

User.hasMany(PushSubscription, { foreignKey: 'userId', onDelete: 'CASCADE' });
PushSubscription.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
