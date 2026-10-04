import 'dotenv/config';
import bcrypt from 'bcrypt';
import { getBcryptRounds, validatePassword } from './middleware/validation.js';
import { User, sequelize } from './models/userModel.js';
import { assertCurrentSchema } from './scripts/migrate-schema.js';
import { resolveAdminFacility } from './services/facilityService.js';
import { AuditService } from './services/auditService.js';

try {
  await assertCurrentSchema();
  const required = ['EMAIL','PASSWORD','NAME','FIRST_NAME','LAST_NAME','PHONE','ADDRESS','DATE_OF_BIRTH','GENDER','ADMIN_ID'];
  for (const key of required) if (!process.env['HOSPITAL_' + key]) throw new Error('Set HOSPITAL_' + key + ' before creating a hospital account');
  const actor = await User.findByPk(Number(process.env.HOSPITAL_ADMIN_ID));
  if (!actor || actor.role !== 'admin' || !actor.isActive) throw new Error('HOSPITAL_ADMIN_ID must identify an active administrator');
  if (!validatePassword(process.env.HOSPITAL_PASSWORD)) throw new Error('HOSPITAL_PASSWORD does not meet the password policy');
  if (await User.findOne({ where: { email: process.env.HOSPITAL_EMAIL } })) throw new Error('An account already exists for this email; no account was changed');
  const password = await bcrypt.hash(process.env.HOSPITAL_PASSWORD, getBcryptRounds());
  await sequelize.transaction(async transaction => {
    const facility = await resolveAdminFacility({ hospitalName: process.env.HOSPITAL_NAME, adminId: actor.id }, transaction);
    const user = await User.create({ firstName: process.env.HOSPITAL_FIRST_NAME, lastName: process.env.HOSPITAL_LAST_NAME, email: process.env.HOSPITAL_EMAIL, password, phone: process.env.HOSPITAL_PHONE, address: process.env.HOSPITAL_ADDRESS, dateOfBirth: process.env.HOSPITAL_DATE_OF_BIRTH, gender: process.env.HOSPITAL_GENDER, role: 'hospital', hospitalName: facility.hospitalName, facilityId: facility.id, isActive: true, emailVerified: true }, { transaction });
    await AuditService.logAction(actor.id, 'HOSPITAL_BOOTSTRAP', 'Users', user.id, null, { role: 'hospital', facilityId: facility.id }, { source: 'bootstrap_cli', transaction });
  });
  console.log('Hospital account created with a verified facility assignment. No credentials are printed.');
} catch (error) { console.error('Bootstrap failed:', error.message); process.exitCode = 1; }
finally { await sequelize.close(); }
