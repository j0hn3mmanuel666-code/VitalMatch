// Administrative coordination interval; medical screening remains a staff task.
function calendarToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const read = type => Number(parts.find(part => part.type === type).value);
  return { year: read('year'), month: read('month'), day: read('day') };
}
export function parseBirthDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
export function donorAge(value, now = new Date()) {
  if (!value) return null;
  const birth = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(birth.getTime())) return null;
  const today = calendarToday(now), month = birth.getUTCMonth() + 1, day = birth.getUTCDate();
  return today.year - birth.getUTCFullYear() - (today.month < month || today.month === month && today.day < day ? 1 : 0);
}
export function donorAgeBounds(now = new Date()) {
  const today = calendarToday(now);
  const cutoff = year => {
    const lastDay = new Date(Date.UTC(year,today.month,0)).getUTCDate();
    return new Date(Date.UTC(year,today.month - 1,Math.min(today.day,lastDay),23,59,59,999));
  };
  return { after: cutoff(today.year - 66), through: cutoff(today.year - 18) };
}
export function isDonorAgeEligible(value, now = new Date()) {
  const age = donorAge(value, now);
  return age !== null && age >= 18 && age <= 65;
}
export function donationIntervalDays() {
  const days = Number(process.env.DONATION_INTERVAL_DAYS || 56);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 56;
}
export function nextCoordinationDate(donor) {
  if (!donor?.lastDonationDate) return null;
  const date = new Date(donor.lastDonationDate);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + donationIntervalDays());
  return date;
}
export function isDonorReady(donor, now = new Date()) {
  const next = nextCoordinationDate(donor);
  return !!donor?.isAvailable && isDonorAgeEligible(donor?.dateOfBirth, now) && (!next || next <= now);
}
export function unitsRemaining(request) {
  if (request.unitsFulfilled === null && request.status === 'fulfilled') return 0;
  return Math.max(0, Number(request.unitsRequired) - Number(request.unitsFulfilled || 0));
}
