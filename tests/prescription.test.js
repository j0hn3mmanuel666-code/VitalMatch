import test from 'node:test';
import assert from 'node:assert/strict';
import { prescriptionType, canReadPrescription } from '../services/prescriptionService.js';

test('accepts image signatures and rejects disguised or unsupported files', () => {
  assert.equal(prescriptionType(Buffer.from('89504e470d0a1a0a', 'hex')), 'image/png');
  assert.equal(prescriptionType(Buffer.from('ffd8ffe000', 'hex')), 'image/jpeg');
  assert.equal(prescriptionType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(prescriptionType(Buffer.from('<svg></svg>')), null);
  assert.equal(prescriptionType(Buffer.from('%PDF-1.4')), null);
});

test('clinical documents are limited to owner, admin and assigned hospital', () => {
  const request = { userId: 1, facilityId: 8 };
  assert.equal(canReadPrescription(request, { id: 1, role: 'user' }), true);
  assert.equal(canReadPrescription(request, { id: 2, role: 'admin' }), true);
  assert.equal(canReadPrescription(request, { id: 2, role: 'donor', facilityId: 8 }), false);
  assert.equal(canReadPrescription(request, { id: 2, role: 'hospital', facilityId: 9 }), false);
  assert.equal(canReadPrescription(request, { id: 2, role: 'hospital', facilityId: 8 }), true);
  assert.equal(canReadPrescription(request, { id: 2, role: 'hospital_admin', facilityId: 8 }), true);
  assert.equal(canReadPrescription(request, null), false);
});
