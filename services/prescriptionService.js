import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { isHospitalAccount } from './accountPolicy.js';

export const prescriptionDirectory = path.resolve('private/prescriptions');
export function prescriptionType(bytes) {
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export const canReadPrescription = (request, account) => !!(request && account && (
  request.userId === account.id || account.role === 'admin' ||
  isHospitalAccount(account) && account.facilityId && account.facilityId === request.facilityId
));
export async function savePrescription(file) {
  if (!file) return null;
  const type = prescriptionType(file.buffer);
  if (!type || file.size > 5 * 1024 * 1024) throw new Error('Invalid prescription image');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  const key = crypto.randomUUID() + '.' + extension;
  await mkdir(prescriptionDirectory, { recursive: true });
  await writeFile(path.join(prescriptionDirectory, key), file.buffer, { flag: 'wx', mode: 0o600 });
  return key;
}
export async function removePrescription(key) {
  if (!key || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) return;
  await unlink(path.join(prescriptionDirectory, key)).catch(error => {
    if (error.code !== 'ENOENT') console.error('Could not remove unused prescription:', error.code);
  });
}
