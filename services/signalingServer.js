import callHistoryService from './callHistoryService.js';
import { loadSessionAccount } from './sessionAuth.js';
import { getRuntimeSettings } from './runtimeSettings.js';
import { canonicalRole } from './accountPolicy.js';

const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const validDescription = (value, type) => value && value.type === type && typeof value.sdp === 'string' && value.sdp.length <= 65536;

export class SignalingServer {
  constructor(io, sessionMiddleware, options = {}) {
    this.io = io;
    this.sessionMiddleware = sessionMiddleware;
    this.loadAccount = options.loadAccount || loadSessionAccount;
    this.history = options.history || callHistoryService;
    this.getOperatingStatus = options.getOperatingStatus || (() => getRuntimeSettings().general.systemStatus);
    this.serviceAvailable = account => this.getOperatingStatus() === 'online' || canonicalRole(account?.role) === 'admin';
    this.activeUsers = new Map(); // userId -> Set<socketId>, supports multiple tabs
    this.activeCalls = new Map();
    this.pendingUsers = new Set();
    this.eventLimits = new Map();
  }
  initialize() {
    this.io.use((socket, next) => this.sessionMiddleware(socket.request, {}, next));
    this.io.use(async (socket, next) => {
      try {
        const account = await this.loadAccount(socket.request.session);
        if (!account) return next(new Error('Authentication required'));
        if (!this.serviceAvailable(account)) return next(new Error('Service temporarily unavailable'));
        socket.userId = Number(account.id);
        next();
      } catch { next(new Error('Authentication unavailable')); }
    });
    this.io.on('connection', socket => this.handleConnection(socket));
  }
  async authenticateSocket(socket) {
    try {
      const session = socket.request.session;
      if (typeof session?.reload === 'function') {
        await new Promise((resolve, reject) => session.reload(error => error ? reject(error) : resolve()));
      }
      const account = await this.loadAccount(socket.request.session);
      if (!account || Number(account.id) !== socket.userId) throw new Error('Session revoked');
      if (!this.serviceAvailable(account)) {
        socket.emit('call:error', { code: 'SERVICE_UNAVAILABLE', error: 'Calling is temporarily unavailable for maintenance.' });
        socket.disconnect(true);
        return false;
      }
      return true;
    } catch {
      socket.emit('call:error', { code: 'AUTH_REQUIRED', error: 'Please log in again.' });
      socket.disconnect(true);
      return false;
    }
  }
  async enforceOperatingStatus() {
    await Promise.all([...this.io.sockets.sockets.values()].map(socket => this.authenticateSocket(socket)));
  }
  allowEvent(socket, event) {
    const now = Date.now();
    const key = `${socket.userId}:${event}`;
    const limit = event === 'offer' ? 10 : event === 'ice' ? 300 : 60;
    const item = this.eventLimits.get(key);
    const state = item && now - item.since < 60000 ? item : { since: now, count: 0 };
    state.count++;
    this.eventLimits.set(key, state);
    if (this.eventLimits.size > 1000) for (const [oldKey, old] of this.eventLimits) if (now - old.since > 60000) this.eventLimits.delete(oldKey);
    if (state.count <= limit) return true;
    socket.emit('call:error', { code: 'RATE_LIMITED', error: 'Please slow down and try again.' });
    return false;
  }
  handleConnection(socket) {
    if (!this.activeUsers.has(socket.userId)) this.activeUsers.set(socket.userId, new Set());
    this.activeUsers.get(socket.userId).add(socket.id);
    socket.join(`user:${socket.userId}`);
    socket.join(`session:${socket.request.sessionID}`);
    const events = { 'call:offer': ['offer', 'handleCallOffer'], 'call:answer': ['answer', 'handleCallAnswer'],
      'call:ice-candidate': ['ice', 'handleIceCandidate'], 'call:decline': ['decline', 'handleCallDecline'], 'call:end': ['end', 'handleCallEnd'] };
    for (const [event, [name, handler]] of Object.entries(events)) socket.on(event, async data => {
      try {
        if (this.allowEvent(socket, name) && await this.authenticateSocket(socket)) await this[handler](socket, data || {});
      } catch { socket.emit('call:error', { code: 'SIGNALING_FAILED', error: 'Call operation failed.' }); }
    });
    const authTimer = setInterval(() => this.authenticateSocket(socket), 30000);
    authTimer.unref();
    socket.on('disconnect', () => { clearInterval(authTimer); this.handleDisconnect(socket); });
  }
  callForActor(socket, callId, calleeOnly = false) {
    if (!positiveId(callId)) return null;
    const call = this.activeCalls.get(Number(callId));
    if (!call || (calleeOnly ? call.calleeId !== socket.userId : call.callerId !== socket.userId && call.calleeId !== socket.userId)) {
      socket.emit('call:error', { code: 'CALL_UNAVAILABLE', error: 'Call unavailable.' });
      return null;
    }
    return call;
  }
  async handleCallOffer(socket, { recipientId, offer, callType }) {
    const callerId = socket.userId;
    const calleeId = Number(recipientId);
    if (!positiveId(recipientId) || calleeId === callerId || !['audio', 'video'].includes(callType) || !validDescription(offer, 'offer')) {
      return socket.emit('call:error', { code: 'INVALID_CALL', error: 'Invalid call request.' });
    }
    if (!this.isUserOnline(calleeId)) return socket.emit('call:error', { code: 'RECIPIENT_OFFLINE', error: 'Recipient unavailable.' });
    // An online socket is not evidence that its account is still authorized.
    // Check recipient sessions now, rather than waiting for the heartbeat.
    const recipients = [...(this.activeUsers.get(calleeId) || [])].map(id => this.io.sockets.sockets.get(id)).filter(Boolean);
    const authorized = await Promise.all(recipients.map(recipient => this.authenticateSocket(recipient)));
    if (!authorized.some(Boolean)) return socket.emit('call:error', { code: 'RECIPIENT_OFFLINE', error: 'Recipient unavailable.' });
    if (this.pendingUsers.has(callerId) || this.pendingUsers.has(calleeId) || [...this.activeCalls.values()].some(call =>
      [call.callerId, call.calleeId].some(id => id === callerId || id === calleeId))) {
      return socket.emit('call:error', { code: 'USER_BUSY', error: 'A participant is already in a call.' });
    }
    this.pendingUsers.add(callerId); this.pendingUsers.add(calleeId);
    try {
      const callId = await this.history.createCallRecord(callerId, calleeId, callType);
      const call = { callerId, calleeId, callType, state: 'ringing', startedAt: null };
      call.timeout = setTimeout(async () => {
        if (!this.activeCalls.has(callId) || call.state !== 'ringing') return;
        this.activeCalls.delete(callId);
        this.broadcastToUser(callerId, 'call:ended', { callId, reason: 'unanswered' });
        this.broadcastToUser(calleeId, 'call:ended', { callId, reason: 'unanswered' });
        await this.history.updateCallOutcome(callId, 'missed').catch(() => {});
      }, 45000);
      call.timeout.unref();
      this.activeCalls.set(callId, call);
      socket.emit('call:created', { callId });
      this.broadcastToUser(calleeId, 'call:incoming', { callId, caller: { id: callerId }, callType, offer });
    } catch { socket.emit('call:error', { code: 'SIGNALING_FAILED', error: 'Failed to initiate call.' }); }
    finally { this.pendingUsers.delete(callerId); this.pendingUsers.delete(calleeId); }
  }
  async handleCallAnswer(socket, { callId, answer }) {
    const call = this.callForActor(socket, callId, true);
    if (!call || call.state !== 'ringing' || !validDescription(answer, 'answer')) return;
    call.state = 'active'; call.startedAt = Date.now(); clearTimeout(call.timeout);
    this.broadcastToUser(call.callerId, 'call:accepted', { callId: Number(callId), answer });
    for (const id of this.activeUsers.get(call.calleeId) || []) if (id !== socket.id) this.io.sockets.sockets.get(id)?.emit('call:answered-elsewhere', { callId: Number(callId) });
  }
  async handleIceCandidate(socket, { callId, candidate }) {
    const call = this.callForActor(socket, callId);
    if (!call || !candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096) return;
    const recipientId = call.callerId === socket.userId ? call.calleeId : call.callerId;
    this.broadcastToUser(recipientId, 'call:ice-candidate', { callId: Number(callId), candidate });
  }
  async finishCall(socket, callId, outcome) {
    const call = this.callForActor(socket, callId, outcome === 'declined');
    if (!call || (outcome === 'declined' && call.state !== 'ringing')) return;
    if (outcome === 'completed' && call.state !== 'active') outcome = 'failed';
    this.activeCalls.delete(Number(callId)); clearTimeout(call.timeout);
    const duration = call.startedAt ? Math.max(0, Math.round((Date.now() - call.startedAt) / 1000)) : 0;
    await this.history.updateCallOutcome(Number(callId), outcome, duration).catch(() => {});
    const event = outcome === 'declined' ? 'call:declined' : 'call:ended';
    this.broadcastToUser(call.callerId, event, { callId: Number(callId), reason: outcome });
    this.broadcastToUser(call.calleeId, event, { callId: Number(callId), reason: outcome });
  }
  handleCallDecline(socket, { callId }) { return this.finishCall(socket, callId, 'declined'); }
  handleCallEnd(socket, { callId }) { return this.finishCall(socket, callId, 'completed'); }
  handleDisconnect(socket) {
    const sockets = this.activeUsers.get(socket.userId);
    sockets?.delete(socket.id);
    if (sockets?.size) return;
    this.activeUsers.delete(socket.userId);
    for (const [callId, call] of this.activeCalls) if ([call.callerId, call.calleeId].includes(socket.userId)) {
      clearTimeout(call.timeout); this.activeCalls.delete(callId);
      this.broadcastToUser(call.callerId === socket.userId ? call.calleeId : call.callerId, 'call:ended', { callId, reason: 'connection_failed' });
      this.history.updateCallOutcome(callId, 'failed', call.startedAt ? Math.round((Date.now() - call.startedAt) / 1000) : 0).catch(() => {});
    }
  }
  getUserSocket(userId) {
    const id = this.activeUsers.get(Number(userId))?.values().next().value;
    return id ? this.io.sockets.sockets.get(id) : null;
  }
  isUserOnline(userId) { return !!this.activeUsers.get(Number(userId))?.size; }
  broadcastToUser(userId, event, data) {
    for (const id of this.activeUsers.get(Number(userId)) || []) this.io.sockets.sockets.get(id)?.emit(event, data);
  }
}
