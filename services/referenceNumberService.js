import { ReferenceCounter } from "../models/referenceCounterModel.js";

// System-generated patient reference numbers.
//
// Format: VM5200-YYNNNNN
//   VM     = VitalMatch
//   5200   = Oriental Mindoro postal code
//   YY     = last 2 digits of the current year (Asia/Manila)
//   NNNNN  = zero-padded sequence, one per request, resets each year
//
// Example: VM5200-2600001 (first request of 2026).
// The requester shares the full code (or its last 5 digits) with a
// coordinator; administrators search the code to pull up the request.

export const REFERENCE_PREFIX = "VM5200";
export const MAX_SEQUENCE = 99999;

export function manilaYear(date = new Date()) {
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric" }).format(date);
  return Number(year);
}

export function formatPatientReference(yearFull, sequence) {
  const yy = String(yearFull).slice(-2);
  return `${REFERENCE_PREFIX}-${yy}${String(sequence).padStart(5, "0")}`;
}

export function isSystemReference(value) {
  return typeof value === "string" && /^VM5200-\d{7}$/.test(value);
}

// Reserves and returns the next reference number for the current year.
// Must be called inside the request-creation transaction: the counter row
// is locked FOR UPDATE so concurrent submissions serialize.
export async function nextPatientReference(transaction) {
  const yearFull = manilaYear();
  let counter = await ReferenceCounter.findByPk(yearFull, { transaction, lock: transaction.LOCK.UPDATE });
  if (!counter) {
    try {
      counter = await ReferenceCounter.create({ year: yearFull, lastSequence: 0 }, { transaction });
      counter = await ReferenceCounter.findByPk(yearFull, { transaction, lock: transaction.LOCK.UPDATE });
    } catch (error) {
      // A concurrent submission created the row first; reload under lock.
      if (error.name !== "SequelizeUniqueConstraintError") throw error;
      counter = await ReferenceCounter.findByPk(yearFull, { transaction, lock: transaction.LOCK.UPDATE });
    }
  }
  const next = Number(counter.lastSequence || 0) + 1;
  if (next > MAX_SEQUENCE) {
    const { WorkflowError } = await import("./requestLifecycleService.js");
    throw new WorkflowError("Reference numbers for this year are exhausted. Contact the system administrator.", 503);
  }
  await counter.update({ lastSequence: next }, { transaction });
  return formatPatientReference(yearFull, next);
}
