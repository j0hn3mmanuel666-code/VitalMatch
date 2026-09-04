/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { Sequelize, DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

// Call model for storing call history
export const Call = sequelize.define("Call", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  callerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  calleeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  conversationId: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  callType: {
    type: DataTypes.ENUM('audio', 'video'),
    allowNull: false
  },
  outcome: {
    type: DataTypes.ENUM('completed', 'missed', 'declined', 'failed'),
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in seconds'
  },
  initiatedAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  endedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  errorType: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  seenByCaller: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  seenByCallee: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'Calls',
  timestamps: true,
  indexes: [
    { fields: ['callerId'] },
    { fields: ['calleeId'] },
    { fields: ['conversationId'] },
    { fields: ['initiatedAt'] }
  ]
});

// Relationships
Call.belongsTo(User, { as: 'caller', foreignKey: 'callerId' });
Call.belongsTo(User, { as: 'callee', foreignKey: 'calleeId' });

export { sequelize };
