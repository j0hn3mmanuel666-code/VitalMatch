/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import callHistoryService from "../services/callHistoryService.js";
import crypto from 'node:crypto';

// Coturn REST credentials are short lived and bound to this signed-in account.
// Never expose the shared signing secret or permanent provider passwords.
export const getCallConfiguration = (req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const urls = (process.env.TURN_URLS || '').split(',').map(url => url.trim()).filter(url => /^turns?:[A-Za-z0-9.\-\[\]:]+(?:\?transport=(?:udp|tcp))?$/.test(url));
  const secret = process.env.TURN_SECRET;
  const relayConfigured = urls.length > 0 && typeof secret === 'string' && secret.length >= 32;
  if (relayConfigured) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${req.session.userId}`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
    iceServers.push({ urls, username, credential });
  }
  res.set('Cache-Control', 'private, no-store').json({ iceServers, relayConfigured });
};

// GET /api/calls/history
export const getCallHistory = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const limit = Math.max(1, parseInt(req.query.limit) || 50);
    const calls = await callHistoryService.getCallHistory(req.session.userId, Math.min(limit, 100));
    
    res.json({ calls, total: calls.length });
  } catch (error) {
    console.error('Error getting call history:');
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
    if (!/^\d+-\d+$/.test(conversationId)) return res.status(400).json({ error: 'Invalid conversation' });
    const [userId1, userId2] = conversationId.split('-').map(Number);
    if (![userId1, userId2].every(id => Number.isSafeInteger(id) && id > 0) || userId1 === userId2) return res.status(400).json({ error: 'Invalid conversation' });
    
    // Verify user is part of the conversation
    if (userId1 !== req.session.userId && userId2 !== req.session.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const calls = await callHistoryService.getCallHistoryForConversation(userId1, userId2, 20, req.session.userId);
    res.json({ calls });
  } catch (error) {
    console.error('Error getting conversation call history:');
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
    if (!/^\d+$/.test(callId) || !Number.isSafeInteger(Number(callId))) return res.status(400).json({ error: 'Invalid call' });
    const seen = await callHistoryService.markCallAsSeen(Number(callId), req.session.userId);
    if (!seen) return res.status(404).json({ error: 'Call unavailable' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking call as seen:');
    res.status(500).json({ error: 'Failed to mark call as seen' });
  }
};

// GET /api/calls/analytics (admin only)
export const getCallAnalytics = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (req.authAccount?.role?.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Forbidden - Admin access required' });
  }
  
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate > endDate || endDate - startDate > 366 * 86400000) return res.status(400).json({ error: 'Use a valid date range of at most one year' });
    
    const analytics = await callHistoryService.getCallAnalytics(startDate, endDate);
    res.json(analytics);
  } catch (error) {
    console.error('Error getting call analytics:');
    res.status(500).json({ error: 'Failed to get call analytics' });
  }
};
