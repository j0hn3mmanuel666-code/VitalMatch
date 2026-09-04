import 'dotenv/config';
import { Donor } from './models/donorModel.js';
import { BloodRequest } from './models/bloodRequestModel.js';

try {
  await Donor.sync({ alter: true });
  await BloodRequest.sync({ alter: true });
  console.log('Nearest-donor location fields are ready.');
  process.exit(0);
} catch (error) {
  console.error('Nearest-donor migration failed:', error);
  process.exit(1);
}
