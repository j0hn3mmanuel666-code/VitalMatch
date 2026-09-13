/*
  migrate_indexes.js — Adds performance indexes on high-traffic columns.
  Safe to re-run (IF NOT EXISTS).

  Usage:  node migrate_indexes.js
*/

import { sequelize } from './models/db.js';

const indexes = [
  // ── BloodRequests ──────────────────────────────────────────────
  // Matching engine filters by status + bloodType constantly
  { table: 'BloodRequests', index: 'idx_br_status',            cols: ['status'] },
  { table: 'BloodRequests', index: 'idx_br_bloodType',         cols: ['bloodType'] },
  { table: 'BloodRequests', index: 'idx_br_userId',            cols: ['userId'] },
  // Compound: active requests by blood type (core matching query)
  { table: 'BloodRequests', index: 'idx_br_status_bloodType',  cols: ['status', 'bloodType'] },
  // Emergency lookup: urgent active requests
  { table: 'BloodRequests', index: 'idx_br_emergency',         cols: ['isEmergency', 'status'] },
  // Facility review scoped queries
  { table: 'BloodRequests', index: 'idx_br_hospitalId',        cols: ['hospitalId'] },

  // ── Donors ─────────────────────────────────────────────────────
  // Matching engine: available donors by blood type
  { table: 'Donors', index: 'idx_donor_bloodType',   cols: ['bloodType'] },
  { table: 'Donors', index: 'idx_donor_isAvailable',  cols: ['isAvailable'] },
  { table: 'Donors', index: 'idx_donor_userId',       cols: ['userId'] },
  // Compound: availability lookup (core matching query)
  { table: 'Donors', index: 'idx_donor_avail_blood',  cols: ['isAvailable', 'bloodType'] },

  // ── Notifications ──────────────────────────────────────────────
  // User inbox: unread notifications
  { table: 'Notifications', index: 'idx_notif_userId',     cols: ['userId'] },
  { table: 'Notifications', index: 'idx_notif_user_read',  cols: ['userId', 'isRead'] },

  // ── Messages ───────────────────────────────────────────────────
  // Conversation lookups
  { table: 'Messages', index: 'idx_msg_conversation',  cols: ['conversationId'] },
  { table: 'Messages', index: 'idx_msg_sender',        cols: ['senderId'] },
  { table: 'Messages', index: 'idx_msg_receiver',      cols: ['receiverId'] },
  // Conversation + sort by time
  { table: 'Messages', index: 'idx_msg_conv_created',  cols: ['conversationId', 'createdAt'] },

  // ── Calls ──────────────────────────────────────────────────────
  { table: 'Calls', index: 'idx_call_requestId',  cols: ['requestId'] },
  { table: 'Calls', index: 'idx_call_donorId',    cols: ['donorId'] },
];

async function run() {
  const qi = sequelize.getQueryInterface();

  for (const { table, index, cols } of indexes) {
    try {
      await qi.addIndex(table, cols, { name: index, ifNotExists: true });
      console.log(`  ✓ ${index} on ${table}(${cols.join(', ')})`);
    } catch (err) {
      // MySQL < 9 doesn't support IF NOT EXISTS for indexes; catch duplicates
      if (err.message && err.message.includes('Duplicate key name')) {
        console.log(`  · ${index} already exists — skipping`);
      } else {
        console.error(`  ✗ ${index} failed:`, err.message);
      }
    }
  }

  console.log('\nIndex migration complete.');
  process.exit(0);
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1); });
