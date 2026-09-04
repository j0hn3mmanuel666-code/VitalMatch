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

import { User } from "../models/userModel.js";
import { Donor } from "../models/donorModel.js";
import { BloodRequest } from "../models/bloodRequestModel.js";
import { AuditService } from "./auditService.js";
import { sequelize } from "../models/db.js";
import { Op } from "sequelize";
import bcrypt from "bcrypt";

/**
 * User Service Layer
 * Handles business logic for user management operations
 */
export class UserService {
  
  /**
   * Get paginated user list with filters
   * @param {Object} filters - Search and filter criteria
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} User list with pagination metadata
   */
  static async getUserList(filters = {}, pagination = {}) {
    try {
      const { search = '', role = '', status = '', dateRange = {} } = filters;
      const { page = 1, limit = 20, sort = 'createdAt DESC' } = pagination;
      
      const offset = (page - 1) * limit;
      const whereClause = {};
      
      // Search filter
      if (search) {
        whereClause[Op.or] = [
          { firstName: { [Op.like]: `%${search}%` } },
          { lastName: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ];
      }
      
      // Role filter
      if (role) {
        whereClause.role = role;
      }
      
      // Date range filter
      if (dateRange.start && dateRange.end) {
        whereClause.createdAt = {
          [Op.between]: [new Date(dateRange.start), new Date(dateRange.end)]
        };
      }
      
      const { count, rows: users } = await User.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [[sort.split(' ')[0], sort.split(' ')[1] || 'ASC']],
        attributes: { exclude: ['password'] }
      });
      
      // Get additional user statistics
      const usersWithStats = await Promise.all(users.map(async (user) => {
        const donorProfile = await Donor.findOne({ where: { userId: user.id } });
        const bloodRequests = await BloodRequest.count({ where: { userId: user.id } });
        
        return {
          ...user.toJSON(),
          isDonor: !!donorProfile,
          bloodRequestCount: bloodRequests,
          lastLoginAt: user.lastLoginAt || null
        };
      }));
      
      const totalPages = Math.ceil(count / limit);
      
      return {
        users: usersWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount: count,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      console.error('Error in getUserList:', error);
      throw new Error('Failed to retrieve user list');
    }
  }
  
  /**
   * Get user by ID with detailed information
   * @param {number} id - User ID
   * @returns {Promise<Object>} User details
   */
  static async getUserById(id) {
    try {
      const user = await User.findByPk(id, {
        attributes: { exclude: ['password'] }
      });
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Get additional user data
      const donorProfile = await Donor.findOne({ where: { userId: id } });
      const bloodRequests = await BloodRequest.findAll({ 
        where: { userId: id },
        order: [['createdAt', 'DESC']],
        limit: 10
      });
      
      return {
        ...user.toJSON(),
        donorProfile: donorProfile ? donorProfile.toJSON() : null,
        recentBloodRequests: bloodRequests.map(req => req.toJSON()),
        isDonor: !!donorProfile
      };
    } catch (error) {
      console.error('Error in getUserById:', error);
      throw error;
    }
  }
  
  /**
   * Create new user with validation and audit
   * @param {Object} userData - User data
   * @param {number} adminId - ID of admin creating the user
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Created user
   */
  static async createUser(userData, adminId, context = {}) {
    try {
      const { firstName, lastName, email, phone, address, dateOfBirth, gender, role = 'user' } = userData;
      
      // Validate required fields
      if (!firstName || !lastName || !email || !phone || !address || !dateOfBirth || !gender) {
        throw new Error('All required fields must be provided');
      }
      
      // Check if email already exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        throw new Error('Email already exists');
      }
      
      // Generate secure temporary password
      const tempPassword = this.generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      // Create user
      const newUser = await User.create({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phone,
        address,
        dateOfBirth,
        gender,
        role,
        createdBy: adminId
      });
      
      // Log audit entry
      await AuditService.logUserCreation(newUser.id, adminId, userData, context);
      
      return {
        user: {
          id: newUser.id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          role: newUser.role,
          createdAt: newUser.createdAt
        },
        tempPassword
      };
    } catch (error) {
      console.error('Error in createUser:', error);
      throw error;
    }
  }
  
  /**
   * Update user with change detection and audit
   * @param {number} id - User ID
   * @param {Object} userData - Updated user data
   * @param {number} adminId - ID of admin updating the user
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Updated user
   */
  static async updateUser(id, userData, adminId, context = {}) {
    try {
      const user = await User.findByPk(id);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Detect changes
      const changes = this.detectChanges(user.toJSON(), userData);
      if (Object.keys(changes).length === 0) {
        return { user: user.toJSON(), changes: {} };
      }
      
      // Validate email uniqueness if changed
      if (userData.email && userData.email !== user.email) {
        const existingUser = await User.findOne({ 
          where: { 
            email: userData.email,
            id: { [Op.ne]: id }
          }
        });
        if (existingUser) {
          throw new Error('Email already exists');
        }
      }
      
      // Update user
      await user.update({
        ...userData,
        updatedBy: adminId,
        updatedAt: new Date()
      });
      
      // Log audit entry
      await AuditService.logUserUpdate(id, adminId, changes, context);
      
      return {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          updatedAt: user.updatedAt
        },
        changes
      };
    } catch (error) {
      console.error('Error in updateUser:', error);
      throw error;
    }
  }
  
  /**
   * Delete user (soft delete)
   * @param {number} id - User ID
   * @param {number} adminId - ID of admin deleting the user
   * @param {Object} context - Request context
   * @returns {Promise<boolean>} Success status
   */
  static async deleteUser(id, adminId, context = {}) {
    try {
      const user = await User.findByPk(id);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Delete associated records to avoid foreign key constraint errors
      await sequelize.query('DELETE FROM Calls WHERE callerId = :id OR calleeId = :id', { replacements: { id } });
      await sequelize.query('DELETE FROM Messages WHERE senderId = :id OR receiverId = :id', { replacements: { id } });
      
      await BloodRequest.destroy({ where: { userId: id } });
      await Donor.destroy({ where: { userId: id } });

      // For now, perform hard delete. In production, implement soft delete
      await user.destroy();
      
      // Log audit entry
      await AuditService.logUserDeletion(id, adminId, 'Admin deletion', context);
      
      return true;
    } catch (error) {
      console.error('Error in deleteUser:', error);
      throw error;
    }
  }
  
  /**
   * Update user role with permission checks
   * @param {number} userId - User ID
   * @param {string} newRole - New role
   * @param {number} adminId - ID of admin making the change
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Updated user
   */
  static async updateUserRole(userId, newRole, adminId, context = {}) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      const oldRole = user.role;
      if (oldRole === newRole) {
        return { user: user.toJSON(), changed: false };
      }
      
      // Validate role
      if (!['user', 'admin', 'hospital_admin'].includes(newRole)) {
        throw new Error('Invalid role');
      }
      
      await user.update({ 
        role: newRole,
        updatedBy: adminId 
      });
      
      // Log role change audit entry
      await AuditService.logRoleChange(userId, adminId, oldRole, newRole, context);
      
      return {
        user: user.toJSON(),
        changed: true,
        oldRole,
        newRole
      };
    } catch (error) {
      console.error('Error in updateUserRole:', error);
      throw error;
    }
  }
  
  /**
   * Reset user password
   * @param {number} userId - User ID
   * @param {number} adminId - ID of admin resetting password
   * @param {Object} context - Request context
   * @returns {Promise<string>} Temporary password
   */
  static async resetPassword(userId, adminId, context = {}) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      const tempPassword = this.generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      await user.update({ 
        password: hashedPassword,
        updatedBy: adminId
      });
      
      // Log password reset audit entry
      await AuditService.logPasswordReset(userId, adminId, context);
      
      return tempPassword;
    } catch (error) {
      console.error('Error in resetPassword:', error);
      throw error;
    }
  }
  
  /**
   * Get user statistics
   * @returns {Promise<Object>} User statistics
   */
  static async getUserStatistics() {
    try {
      const totalUsers = await User.count();
      const activeUsers = await User.count({ where: { role: 'user' } });
      const adminUsers = await User.count({ where: { role: 'admin' } });
      const hospitalAdmins = await User.count({ where: { role: 'hospital_admin' } });
      
      const donorCount = await Donor.count();
      const requestCount = await BloodRequest.count();
      
      return {
        totalUsers,
        activeUsers,
        adminUsers,
        hospitalAdmins,
        donorCount,
        requestCount,
        donorPercentage: totalUsers > 0 ? Math.round((donorCount / totalUsers) * 100) : 0
      };
    } catch (error) {
      console.error('Error in getUserStatistics:', error);
      throw error;
    }
  }
  
  /**
   * Search users with advanced filters
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Search results
   */
  static async searchUsers(query, filters = {}) {
    try {
      const whereClause = {};
      
      if (query) {
        whereClause[Op.or] = [
          { firstName: { [Op.like]: `%${query}%` } },
          { lastName: { [Op.like]: `%${query}%` } },
          { email: { [Op.like]: `%${query}%` } },
          { phone: { [Op.like]: `%${query}%` } }
        ];
      }
      
      if (filters.role) {
        whereClause.role = filters.role;
      }
      
      const users = await User.findAll({
        where: whereClause,
        attributes: { exclude: ['password'] },
        limit: 50,
        order: [['firstName', 'ASC']]
      });
      
      return users.map(user => user.toJSON());
    } catch (error) {
      console.error('Error in searchUsers:', error);
      throw error;
    }
  }
  
  /**
   * Generate secure temporary password
   * @returns {string} Temporary password
   */
  static generateTemporaryPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
  
  /**
   * Detect changes between old and new user data
   * @param {Object} oldData - Original user data
   * @param {Object} newData - New user data
   * @returns {Object} Changes detected
   */
  static detectChanges(oldData, newData) {
    const changes = {};
    const fieldsToCheck = ['firstName', 'lastName', 'email', 'phone', 'address', 'dateOfBirth', 'gender', 'role'];
    
    fieldsToCheck.forEach(field => {
      if (newData[field] !== undefined && newData[field] !== oldData[field]) {
        changes[field] = {
          old: oldData[field],
          new: newData[field]
        };
      }
    });
    
    return changes;
  }
  
  /**
   * Export users to CSV format
   * @param {Object} filters - Export filters
   * @returns {Promise<string>} CSV data
   */
  static async exportUsersToCSV(filters = {}) {
    try {
      const { users } = await this.getUserList(filters, { page: 1, limit: 10000 });
      
      const csvHeader = 'ID,First Name,Last Name,Email,Phone,Role,Is Donor,Blood Requests,Created At\n';
      const csvData = users.map(user => 
        `${user.id},"${user.firstName}","${user.lastName}","${user.email}","${user.phone}","${user.role}","${user.isDonor ? 'Yes' : 'No'}","${user.bloodRequestCount}","${user.createdAt}"`
      ).join('\n');
      
      return csvHeader + csvData;
    } catch (error) {
      console.error('Error in exportUsersToCSV:', error);
      throw error;
    }
  }
}