import 'dotenv/config';
import bcrypt from 'bcrypt';
import { getBcryptRounds, validatePassword } from './middleware/validation.js';
import { User, sequelize } from './models/userModel.js';
import { assertCurrentSchema } from './scripts/migrate-schema.js';
import { AuditService } from './services/auditService.js';

try {
  await assertCurrentSchema();
  const required = ['EMAIL','PASSWORD','FIRST_NAME','LAST_NAME','PHONE','ADDRESS','DATE_OF_BIRTH','GENDER'];
  for (const key of required) if (!process.env['ADMIN_' + key]) throw new Error('Set ADMIN_' + key + ' before bootstrapping an administrator');
  if (!validatePassword(process.env.ADMIN_PASSWORD)) throw new Error('ADMIN_PASSWORD does not meet the password policy');
  if (await User.findOne({ where: { email: process.env.ADMIN_EMAIL } })) throw new Error('An account already exists for this email; no account was changed');
  const password = await bcrypt.hash(process.env.ADMIN_PASSWORD, getBcryptRounds());
  await sequelize.transaction(async transaction => {
    const user = await User.create({ firstName: process.env.ADMIN_FIRST_NAME, lastName: process.env.ADMIN_LAST_NAME, email: process.env.ADMIN_EMAIL, password, phone: process.env.ADMIN_PHONE, address: process.env.ADMIN_ADDRESS, dateOfBirth: process.env.ADMIN_DATE_OF_BIRTH, gender: process.env.ADMIN_GENDER, role: 'admin', isActive: true, emailVerified: true }, { transaction });
    await AuditService.logAction(user.id, 'ADMIN_BOOTSTRAP', 'Users', user.id, null, { role: 'admin' }, { source: 'bootstrap_cli', transaction });
  });
  console.log('Administrator created. No credentials are printed.');
} catch (error) { console.error('Bootstrap failed:', error.message); process.exitCode = 1; }
finally { await sequelize.close(); }
