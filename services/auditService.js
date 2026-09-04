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

import { DataTypes } from "sequelize";
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
  static async initialize() {
    try {
      await AuditLog.sync({ alter: true });
      console.log('Audit service initialized successfully');
    } catch (error) {
      console.error('Error initializing audit service:', error);
      // Continue anyway - the table might already exist
    }
  }
  
  /**
   * Generic method to log an action
   */
  static async logAction(adminId, action, tableName, targetId, oldValues, newValues, context = {}) {
    try {
      await AuditLog.create({
        userId: null,
        adminId,
        action,
        tableName,
        oldValues: oldValues,
        newValues: newValues,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          timestamp: new Date().toISOString(),
          targetId: targetId,
          source: 'admin_panel'
        }
      });
    } catch (error) {
      console.error('Error logging general action:', error);
    }
  }
  
  /**
   * Log user creation
   * @param {number} userId - ID of created user
   * @param {number} adminId - ID of admin creating user
   * @param {Object} userData - User data that was created
   * @param {Object} context - Request context (IP, user agent, etc.)
   */
  static async logUserCreation(userId, adminId, userData, context = {}) {
    try {
      await AuditLog.create({
        userId,
        adminId,
        action: 'USER_CREATE',
        tableName: 'Users',
        oldValues: null,
        newValues: this.sanitizeUserData(userData),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'admin_panel'
        }
      });
    } catch (error) {
      console.error('Error logging user creation:', error);
    }
  }
  
  /**
   * Log user update
   * @param {number} userId - ID of updated user
   * @param {number} adminId - ID of admin updating user
   * @param {Object} changes - Changes made to user
   * @param {Object} context - Request context
   */
  static async logUserUpdate(userId, adminId, changes, context = {}) {
    try {
      await AuditLog.create({
        userId,
        adminId,
        action: 'USER_UPDATE',
        tableName: 'Users',
        oldValues: this.sanitizeChanges(changes, 'old'),
        newValues: this.sanitizeChanges(changes, 'new'),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          timestamp: new Date().toISOString(),
          fieldsChanged: Object.keys(changes),
          source: 'admin_panel'
        }
      });
    } catch (error) {
      console.error('Error logging user update:', error);
    }
  }
  
  /**
   * Log user deletion
   * @param {number} userId - ID of deleted user
   * @param {number} adminId - ID of admin deleting user
   * @param {string} reason - Reason for deletion
   * @param {Object} context - Request context
   */
  static async logUserDeletion(userId, adminId, reason, context = {}) {
    try {
      await AuditLog.create({
        userId,
        adminId,
        action: 'USER_DELETE',
        tableName: 'Users',
        oldValues: null,
        newValues: null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          timestamp: new Date().toISOString(),
          reason: reason || 'No reason provided',
          source: 'admin_panel'
        }
      });
    } catch (error) {
      console.error('Error logging user deletion:', error);
    }
  }
  
  /**
   * Log role change
   * @param {number} userId - ID of user whose role changed
   * @param {number} adminId - ID of admin changing role
   * @param {string} oldRole - Previous role
   * @param {string} newRole - New role
   * @param {Object} context - Request context
   */
  static async logRoleChange(userId, adminId, oldRole, newRole, context = {}) {
    try {
      await AuditLog.create({
        userId,
        adminId,
        action: 'ROLE_CHANGE',
        tableName: 'Users',
        oldValues: { role: oldRole },
        newValues: { role: newRole },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          timestamp: new Date().toISOString(),
          roleEscalation: this.isRoleEscalation(oldRole, newRole),
          source: 'admin_panel'
        }
      });
    } catch (error) {
      console.error('Error logging role change:', error);
    }
  }
  
  /**
   * Log status change
   * @param {number} userId - ID of user whose status changed
   * @param {number} adminId - ID of admin changing status
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {Object} context - Request context
   */
  static async logStatusChange(userId, adminId, oldStatus, newStatus, context = {}) {
    try {
      await AuditLog.create({
        userId,
        adminId,
        action: 'STATUS_CHANGE',
        tableName: 'Users',
        oldValues: { status: oldStatus },
        newValues: { status: newStatus },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          timestamp: new Date().toISOString(),
          statusChange: `${oldStatus} -> ${newStatus}`,
          source: 'admin_panel'
        }
      });
    } catch (error) {
      console.error('Error logging status change:', error);
    }
  }
  
  /**
   * Log password reset
   * @param {number} userId - ID of user whose password was reset
   * @param {number} adminId - ID of admin resetting password
   * @param {Object} context - Request context
   */
  static async logPasswordReset(userId, adminId, context = {}) {
    try {
      await AuditLog.create({
        userId,
        adminId,
        action: 'PASSWORD_RESET',
        tableName: 'Users',
        oldValues: null,
        newValues: null, // Never log password values
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          timestamp: new Date().toISOString(),
          securityAction: true,
          source: 'admin_panel'
        }
      });
    } catch (error) {
      console.error('Error logging password reset:', error);
    }
  }
  
  /**
   * Log bulk operation
   * @param {string} operation - Type of bulk operation
   * @param {Array} userIds - IDs of affected users
   * @param {number} adminId - ID of admin performing operation
   * @param {Object} context - Request context
   */
  static async logBulkOperation(operation, userIds, adminId, context = {}) {
    try {
      await AuditLog.create({
        userId: null, // Bulk operations affect multiple users
        adminId,
        action: `BULK_${operation.toUpperCase()}`,
        tableName: 'Users',
        oldValues: null,
        newValues: null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          timestamp: new Date().toISOString(),
          affectedUsers: userIds,
          userCount: userIds.length,
          bulkOperation: true,
          source: 'admin_panel'
        }
      });
    } catch (error) {
      console.error('Error logging bulk operation:', error);
    }
  }
  
  /**
   * Get audit trail for a specific user
   * @param {number} userId - User ID
   * @param {number} limit - Number of entries to return
   * @returns {Promise<Array>} Audit entries
   */
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
    const roleHierarchy = { 'user': 1, 'hospital_admin': 2, 'admin': 3 };
    return (roleHierarchy[newRole] || 0) > (roleHierarchy[oldRole] || 0);
  }
  
  /**
   * Get request context from Express request
   * @param {Object} req - Express request object
   * @returns {Object} Context information
   */
  static getRequestContext(req) {
    return {
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    };
  }
}

// Initialize audit service
// AuditService.initialize();

export { AuditService, AuditLog };