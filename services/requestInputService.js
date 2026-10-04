import { WorkflowError } from './requestLifecycleService.js';
const types = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const components = ['wholeBlood', 'packedRBC', 'plateletConcentrate', 'freshFrozenPlasma', 'cryoprecipitate', 'plateletApheresis'];
const text = (input, key, minimum = 2, maximum = 255) => {
  const value = typeof input[key] === 'string' ? input[key].trim() : '';
  if (value.length < minimum || value.length > maximum) throw new WorkflowError(`Provide ${key} (${minimum}–${maximum} characters)`);
  return value;
};
const integer = (value, name, min, max) => {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new WorkflowError(`${name} must be an integer between ${min} and ${max}`);
  return result;
};
export function normalizeRequestInput(input) {
  const bloodType = text(input, 'bloodType');
  if (!types.includes(bloodType)) throw new WorkflowError('Select a valid blood type');
  const urgency = text(input, 'urgency');
  if (!['moderate', 'urgent', 'critical'].includes(urgency)) throw new WorkflowError('Select a valid urgency');
  const email = text(input, 'email', 3);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new WorkflowError('Provide a valid contact email');
  const contactNumber = text(input, 'contactNumber', 10, 20);
  if (!/^(?:\+63|0)9\d{9}$/.test(contactNumber.replace(/[\s-]/g, ''))) throw new WorkflowError('Provide a valid Philippine mobile contact number');
  const requiredByDate = new Date(text(input, 'requiredByDate', 10, 30));
  if (!Number.isFinite(requiredByDate.getTime()) || requiredByDate < new Date(Date.now() - 86400000)) throw new WorkflowError('Choose today or a future required date');
  let selected = input['bloodComponents[]'] || input.bloodComponents || [];
  if (typeof selected === 'string') selected = selected.split(',');
  if (!Array.isArray(selected)) throw new WorkflowError('Select valid blood components');
  const bloodComponents = [...new Set(selected)].map(component => {
    if (!components.includes(component)) throw new WorkflowError('Select a recognized blood component');
    const volume = text(input, component + 'Volume', 1, 40);
    if (!/^\d+(?:\.\d+)?(?:\s*(?:ml|mL|units?|bags?))?$/i.test(volume) || Number.parseFloat(volume) <= 0 || Number.parseFloat(volume) > 100000) throw new WorkflowError('Component quantity must be a positive amount, optionally followed by ml or units');
    return { type: component, volume };
  });
  if (!bloodComponents.length) throw new WorkflowError('Select at least one blood component and enter its quantity');
  const latitude = input.latitude === undefined || input.latitude === '' ? null : Number(input.latitude);
  const longitude = input.longitude === undefined || input.longitude === '' ? null : Number(input.longitude);
  if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180))) throw new WorkflowError('Provide valid location coordinates or leave both blank');
  return { patientName: text(input, 'patientName'), patientAge: integer(input.patientAge, 'Patient age', 0, 120), bloodType, unitsRequired: integer(input.unitsRequired, 'Units required', 1, 10), bloodComponents, indicationOfTransfusion: text(input, 'indicationOfTransfusion', 3, 2000), hospitalName: text(input, 'hospitalName'), hospitalAddress: text(input, 'hospitalAddress', 3), city: text(input, 'city'), province: text(input, 'province'), contactPerson: text(input, 'contactPerson'), contactNumber, email, urgency, requiredByDate, notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 2000) : null, latitude, longitude, facilityId: input.facilityId ? integer(input.facilityId, 'Facility', 1, 2147483647) : null };
}
