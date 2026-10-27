import { DataTypes } from 'sequelize';
import { sequelize } from './db.js';
import { User } from './userModel.js';

export const UserFeedback = sequelize.define('UserFeedback', {
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' }, onDelete: 'RESTRICT' },
  role: { type: DataTypes.STRING(24), allowNull: false },
  rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5, isInt: true } },
  category: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'general' },
  comment: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'new' },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: User, key: 'id' }, onDelete: 'RESTRICT' }
}, {
  tableName: 'UserFeedbacks',
  indexes: [{ fields: ['status', 'createdAt'] }, { fields: ['rating', 'createdAt'] }, { fields: ['userId', 'createdAt'] }]
});

UserFeedback.belongsTo(User, { as: 'author', foreignKey: 'userId', onDelete: 'RESTRICT' });
UserFeedback.belongsTo(User, { as: 'reviewer', foreignKey: 'reviewedBy', onDelete: 'RESTRICT' });
