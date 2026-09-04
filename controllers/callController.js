/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import callHistoryService from "../services/callHistoryService.js";

// GET /api/calls/history
export const getCallHistory = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const limit = parseInt(req.query.limit) || 50;
    const calls = await callHistoryService.getCallHistory(req.session.userId, Math.min(limit, 100));
    
    res.json({ calls, total: calls.length });
  } catch (error) {
    console.error('Error getting call history:', error);
    res.status(500).json({ error: 'Failed to get call history' });
  }
};

// GET /api/calls/history/:conversationId
export const getConversationCallHistory = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { conversationId } = req.params;
    const [userId1, userId2] = conversationId.split('-').map(Number);
    
    // Verify user is part of the conversation
    if (userId1 !== req.session.userId && userId2 !== req.session.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const calls = await callHistoryService.getCallHistoryForConversation(userId1, userId2);
    res.json({ calls });
  } catch (error) {
    console.error('Error getting conversation call history:', error);
    res.status(500).json({ error: 'Failed to get conversation call history' });
  }
};

// POST /api/calls/:callId/seen
export const markCallAsSeen = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { callId } = req.params;
    await callHistoryService.markCallAsSeen(parseInt(callId), req.session.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking call as seen:', error);
    res.status(500).json({ error: 'Failed to mark call as seen' });
  }
};

// GET /api/calls/analytics (admin only)
export const getCallAnalytics = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Check if user is admin (you may need to adjust this based on your admin check)
  // For now, assuming there's an isAdmin flag in session
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Forbidden - Admin access required' });
  }
  
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    const analytics = await callHistoryService.getCallAnalytics(startDate, endDate);
    res.json(analytics);
  } catch (error) {
    console.error('Error getting call analytics:', error);
    res.status(500).json({ error: 'Failed to get call analytics' });
  }
};
