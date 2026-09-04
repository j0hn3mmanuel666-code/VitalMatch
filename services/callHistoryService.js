/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { Call } from "../models/callModel.js";
import { User } from "../models/userModel.js";
import { Op } from "sequelize";

export class CallHistoryService {
  
  // Create a new call record
  async createCallRecord(callerId, calleeId, callType) {
    try {
      const ids = [callerId, calleeId].sort((a, b) => a - b);
      const conversationId = `${ids[0]}-${ids[1]}`;
      
      const call = await Call.create({
        callerId,
        calleeId,
        conversationId,
        callType,
        outcome: 'failed', // Default, will be updated
        initiatedAt: new Date()
      });
      
      return call.id;
    } catch (error) {
      console.error("Error creating call record:", error);
      throw error;
    }
  }
  
  // Update call outcome and duration
  async updateCallOutcome(callId, outcome, duration = null) {
    try {
      await Call.update(
        {
          outcome,
          duration,
          endedAt: new Date()
        },
        { where: { id: callId } }
      );
    } catch (error) {
      console.error("Error updating call outcome:", error);
      throw error;
    }
  }
  
  // Get call history for a user
  async getCallHistory(userId, limit = 50) {
    try {
      const calls = await Call.findAll({
        where: {
          [Op.or]: [
            { callerId: userId },
            { calleeId: userId }
          ]
        },
        include: [
          { model: User, as: 'caller', attributes: ['id', 'firstName', 'lastName'] },
          { model: User, as: 'callee', attributes: ['id', 'firstName', 'lastName'] }
        ],
        order: [['initiatedAt', 'DESC']],
        limit
      });
      
      // Format the response
      return calls.map(call => {
        const isIncoming = call.calleeId === userId;
        const otherUser = isIncoming ? call.caller : call.callee;
        
        return {
          id: call.id,
          otherUser: {
            id: otherUser.id,
            name: `${otherUser.firstName} ${otherUser.lastName}`,
            initial: otherUser.firstName.charAt(0).toUpperCase()
          },
          callType: call.callType,
          outcome: call.outcome,
          duration: call.duration,
          isIncoming,
          initiatedAt: call.initiatedAt,
          seen: isIncoming ? call.seenByCallee : call.seenByCaller
        };
      });
    } catch (error) {
      console.error("Error getting call history:", error);
      throw error;
    }
  }
  
  // Get call history for a specific conversation
  async getCallHistoryForConversation(userId1, userId2, limit = 20) {
    try {
      const ids = [userId1, userId2].sort((a, b) => a - b);
      const conversationId = `${ids[0]}-${ids[1]}`;
      
      const calls = await Call.findAll({
        where: { conversationId },
        order: [['initiatedAt', 'DESC']],
        limit
      });
      
      return calls.map(call => ({
        id: call.id,
        callType: call.callType,
        outcome: call.outcome,
        duration: call.duration,
        isIncoming: call.calleeId === userId1,
        initiatedAt: call.initiatedAt
      }));
    } catch (error) {
      console.error("Error getting conversation call history:", error);
      throw error;
    }
  }
  
  // Get call analytics (admin only)
  async getCallAnalytics(startDate, endDate) {
    try {
      const calls = await Call.findAll({
        where: {
          initiatedAt: {
            [Op.between]: [startDate, endDate]
          }
        }
      });
      
      const totalCalls = calls.length;
      const completedCalls = calls.filter(c => c.outcome === 'completed').length;
      const missedCalls = calls.filter(c => c.outcome === 'missed').length;
      const declinedCalls = calls.filter(c => c.outcome === 'declined').length;
      const failedCalls = calls.filter(c => c.outcome === 'failed').length;
      
      const completedCallsWithDuration = calls.filter(c => c.outcome === 'completed' && c.duration);
      const averageDuration = completedCallsWithDuration.length > 0
        ? Math.round(completedCallsWithDuration.reduce((sum, c) => sum + c.duration, 0) / completedCallsWithDuration.length)
        : 0;
      
      const audioCallsCount = calls.filter(c => c.callType === 'audio').length;
      const videoCallsCount = calls.filter(c => c.callType === 'video').length;
      
      // Calculate peak hours
      const hourCounts = {};
      calls.forEach(call => {
        const hour = new Date(call.initiatedAt).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      
      const peakHours = Object.entries(hourCounts)
        .map(([hour, count]) => ({ hour: parseInt(hour), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      return {
        totalCalls,
        completedCalls,
        missedCalls,
        declinedCalls,
        failedCalls,
        averageDuration,
        audioCallsCount,
        videoCallsCount,
        peakHours
      };
    } catch (error) {
      console.error("Error getting call analytics:", error);
      throw error;
    }
  }
  
  // Mark call as seen
  async markCallAsSeen(callId, userId) {
    try {
      const call = await Call.findByPk(callId);
      if (!call) return;
      
      if (call.callerId === userId) {
        await call.update({ seenByCaller: true });
      } else if (call.calleeId === userId) {
        await call.update({ seenByCallee: true });
      }
    } catch (error) {
      console.error("Error marking call as seen:", error);
      throw error;
    }
  }
}

export default new CallHistoryService();
