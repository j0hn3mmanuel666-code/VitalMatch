import test from 'node:test';
import assert from 'node:assert/strict';
import { mapConsentUpdates } from '../services/mapConsentService.js';

test('missing consent preserves the saved choice and never infers opt-in from availability', () => {
  assert.deepEqual(mapConsentUpdates({ isAvailable: 'on' }, { shareOnMap: true }), {});
  assert.deepEqual(mapConsentUpdates({}, null), {});
});
test('explicit grant and withdrawal set a change timestamp; unchanged consent keeps it', () => {
  const granted = mapConsentUpdates({ shareOnMap: 'on' }, null);
  assert.equal(granted.shareOnMap, true); assert.ok(granted.mapConsentUpdatedAt instanceof Date);
  assert.equal(mapConsentUpdates({ shareOnMap: true }, granted).mapConsentUpdatedAt, granted.mapConsentUpdatedAt);
  const revoked = mapConsentUpdates({ mapConsentSubmitted: '1' }, granted);
  assert.equal(revoked.shareOnMap, false); assert.ok(revoked.mapConsentUpdatedAt instanceof Date);
  assert.equal(mapConsentUpdates({ shareOnMap: false }, granted).shareOnMap, false);
  for (const value of ['yes', 'false', 1, ['on'], {}]) assert.throws(() => mapConsentUpdates({ shareOnMap: value }, granted), { status: 400 });
});
