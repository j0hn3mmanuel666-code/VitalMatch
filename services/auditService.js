/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { DataTypes, Op } from "sequelize";
import { sequelize } from "../models/db.js";

// Define AuditLog model
const AuditLog = sequelize.define("AuditLog", {
  userId: { 
    type: DataTypes.INTEGER, 
    allowNull: true,
    comment: 'ID of the user being acted upon'
  },
  adminId: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    comment: 'ID of the admin performing the action'
  },
  action: { 
    type: DataTypes.STRING, 
    allowNull: false,
    comment: 'Type of action performed'
  },
  tableName: { 
    type: DataTypes.STRING, 
    allowNull: false,
    comment: 'Database table affected'
  },
  oldValues: { 
    type: DataTypes.JSON, 
    allowNull: true,
    comment: 'Previous values before change'
  },
  newValues: { 
    type: DataTypes.JSON, 
    allowNull: true,
    comment: 'New values after change'
  },
  ipAddress: { 
    type: DataTypes.STRING, 
    allowNull: true,
    comment: 'IP address of the admin'
  },
  userAgent: { 
    type: DataTypes.TEXT, 
    allowNull: true,
    comment: 'Browser/client information'
  },
  metadata: { 
    type: DataTypes.JSON, 
    allowNull: true,
    comment: 'Additional context information'
  }
}, {
  tableName: 'audit_logs',
  indexes: [
    { fields: ['userId'] },
    { fields: ['adminId'] },
    { fields: ['action'] },
    { fields: ['createdAt'] },
    { fields: ['tableName'] }
  ]
});

/**
 * Audit Service
 * Handles comprehensive audit logging for compliance and security
 */
class AuditService {
  
  /**
   * Initialize audit service and sync database
   */
  static async initialize() { await sequelize.authenticate(); }
  static redact(value) {
    if (Array.isArray(value)) return value.map(v => this.redact(v));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, /password|token|secret|cookie/i.test(k) ? '[redacted]' : this.redact(v)]));
  }
  static async logAction(actorId, action, tableName, targetId, oldValues, newValues, context = {}) {
    return AuditLog.create({
      userId: tableName === 'Users' ? targetId ?? null : null, adminId: actorId,
      action, tableName, oldValues: this.redact(oldValues), newValues: this.redact(newValues),
      ipAddress: context.ipAddress, userAgent: context.userAgent,
      metadata: { timestamp: new Date().toISOString(), actorId, actorRole: context.actorRole || null,
        subjectType: tableName, subjectId: targetId ?? null, source: context.source || 'application', ...context.metadata }
    }, { transaction: context.transaction });
  }
  static async logUserCreation(id, actor, data, context = {}) { return this.logAction(actor, 'USER_CREATE', 'Users', id, null, data, context); }
  static async logUserUpdate(id, actor, changes, context = {}) { return this.logAction(actor, 'USER_UPDATE', 'Users', id, this.sanitizeChanges(changes, 'old'), this.sanitizeChanges(changes, 'new'), context); }
  static async logUserDeletion(id, actor, reason, context = {}) { return this.logAction(actor, 'USER_ARCHIVE', 'Users', id, null, { reason }, context); }
  static async logRoleChange(id, actor, old, role, context = {}) { return this.logAction(actor, 'ROLE_CHANGE', 'Users', id, { role: old }, { role }, context); }
  static async logStatusChange(id, actor, old, status, context = {}) { return this.logAction(actor, 'STATUS_CHANGE', 'Users', id, { status: old }, { status }, context); }
  static async logPasswordReset(id, actor, context = {}) { return this.logAction(actor, 'PASSWORD_RESET', 'Users', id, null, null, context); }
  static async logBulkOperation(operation, userIds, actor, context = {}) { return this.logAction(actor, `BULK_${operation.toUpperCase()}`, 'Users', null, null, { affectedUsers: userIds }, context); }
    static async getAuditTrail(userId, limit = 50) {
    try {
      const auditEntries = await AuditLog.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit,
        raw: true
      });
      
      return auditEntries.map(entry => ({
        ...entry,
        createdAt: new Date(entry.createdAt).toISOString()
      }));
    } catch (error) {
      console.error('Error getting audit trail:', error);
      return [];
    }
  }
  
  /**
   * Get admin activity log
   * @param {number} adminId - Admin ID
   * @param {Object} dateRange - Date range filter
   * @returns {Promise<Array>} Admin activity entries
   */
  static async getAdminActivity(adminId, dateRange = {}) {
    try {
      const whereClause = { adminId };
      
      if (dateRange.start && dateRange.end) {
        whereClause.createdAt = {
          [Op.between]: [new Date(dateRange.start), new Date(dateRange.end)]
        };
      }
      
      const activities = await AuditLog.findAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit: 100,
        raw: true
      });
      
      return activities.map(activity => ({
        ...activity,
        createdAt: new Date(activity.createdAt).toISOString()
      }));
    } catch (error) {
      console.error('Error getting admin activity:', error);
      return [];
    }
  }
  
  /**
   * Get audit statistics
   * @param {Object} dateRange - Date range filter
   * @returns {Promise<Object>} Audit statistics
   */
  static async getAuditStatistics(dateRange = {}) {
    try {
      const whereClause = {};
      
      if (dateRange.start && dateRange.end) {
        whereClause.createdAt = {
          [Op.between]: [new Date(dateRange.start), new Date(dateRange.end)]
        };
      }
      
      const totalEntries = await AuditLog.count({ where: whereClause });
      
      // Get action breakdown
      const actionStats = await AuditLog.findAll({
        where: whereClause,
        attributes: [
          'action',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['action'],
        raw: true
      });
      
      // Get admin activity breakdown
      const adminStats = await AuditLog.findAll({
        where: whereClause,
        attributes: [
          'adminId',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['adminId'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
        limit: 10,
        raw: true
      });
      
      return {
        totalEntries,
        actionBreakdown: actionStats,
        topAdmins: adminStats
      };
    } catch (error) {
      console.error('Error getting audit statistics:', error);
      return { totalEntries: 0, actionBreakdown: [], topAdmins: [] };
    }
  }
  
  /**
   * Clean up old audit logs
   * @param {number} daysToKeep - Number of days to retain logs
   * @returns {Promise<number>} Number of deleted entries
   */
  static async cleanupOldLogs(daysToKeep = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const deletedCount = await AuditLog.destroy({
        where: {
          createdAt: {
            [Op.lt]: cutoffDate
          }
        }
      });
      
      console.log(`Cleaned up ${deletedCount} old audit log entries`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old logs:', error);
      return 0;
    }
  }
  
  /**
   * Sanitize user data for logging (remove sensitive fields)
   * @param {Object} userData - User data to sanitize
   * @returns {Object} Sanitized data
   */
  static sanitizeUserData(userData) {
    const sanitized = { ...userData };
    delete sanitized.password;
    delete sanitized.sessionToken;
    return sanitized;
  }
  
  /**
   * Sanitize changes object for logging
   * @param {Object} changes - Changes object
   * @param {string} type - 'old' or 'new'
   * @returns {Object} Sanitized changes
   */
  static sanitizeChanges(changes, type) {
    const result = {};
    Object.keys(changes).forEach(key => {
      if (key !== 'password' && key !== 'sessionToken') {
        result[key] = changes[key][type];
      }
    });
    return result;
  }
  
  /**
   * Check if role change is an escalation
   * @param {string} oldRole - Previous role
   * @param {string} newRole - New role
   * @returns {boolean} True if escalation
   */
  static isRoleEscalation(oldRole, newRole) {
    const roleHierarchy = { 'user': 1, 'donor': 1, 'hospital': 2, 'hospital_admin': 2, 'admin': 3 };
    return (roleHierarchy[newRole] || 0) > (roleHierarchy[oldRole] || 0);
  }
  
  /**
   * Get request context from Express request
   * @param {Object} req - Express request object
   * @returns {Object} Context information
   */
  static getRequestContext(req) {
    return {
      ipAddress: req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown',
      userAgent: req.get?.('User-Agent') || 'unknown',
      actorRole: req.authAccount?.role || req.session?.userRole || null
    };
  }
}

// Initialize audit service
// AuditService.initialize();

export { AuditService, AuditLog };
