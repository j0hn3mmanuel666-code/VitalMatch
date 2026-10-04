import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEMO_ACCOUNT_DEFINITIONS, assertLocalDemoEnvironment } from '../services/demoAccountPolicy.js';
import { getBcryptRounds, validatePassword } from '../middleware/validation.js';

const projectRoot = new URL('../', import.meta.url);
dotenv.config({ path: fileURLToPath(new URL('.env', projectRoot)), quiet: true });

// Demo credentials must never be installed in a production or remote database.
assertLocalDemoEnvironment();

const credentialsUrl = new URL('.local/demo-accounts.json', projectRoot);
const definitions = DEMO_ACCOUNT_DEFINITIONS;

const { User, sequelize } = await import('../models/userModel.js');
const { Donor } = await import('../models/donorModel.js');
const { Facility } = await import('../models/facilityModel.js');
const { assertCurrentSchema } = await import('./migrate-schema.js');
const { resolveSeedDemoFacility } = await import('../services/demoFacilityService.js');
const { AuditService } = await import('../services/auditService.js');

try {
  await sequelize.authenticate();
  await assertCurrentSchema();
  let credentials;
  try {
    credentials = JSON.parse(await readFile(credentialsUrl, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const existing = await User.count({ where: { email: definitions.map(account => account.email) } });
    if (existing) {
      throw new Error('Demo emails already exist but the local credential file is missing. Existing passwords were not changed.');
    }
    credentials = {
      purpose: 'Local VitalMatch test accounts only. Do not commit or share this file.',
      loginUrl: `http://localhost:${process.env.PORT || 3000}/login`,
      accounts: definitions.map(({ role, email }) => ({
        role,
        email,
        password: `Demo${randomBytes(18).toString('hex')}9aA!`,
      })),
    };
    await mkdir(new URL('.local/', projectRoot), { recursive: true });
    // Save first so a successful database commit always has retrievable credentials.
    await writeFile(credentialsUrl, `${JSON.stringify(credentials, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }

  if (!Array.isArray(credentials.accounts) || credentials.accounts.length !== definitions.length) {
    throw new Error('The local demo credential file is invalid; no accounts were changed.');
  }

  const results = await sequelize.transaction(async transaction => {
    const seeded = [];
    let demoAdmin;
    for (const definition of definitions) {
      const credential = credentials.accounts.find(account => account.email === definition.email && account.role === definition.role);
      if (!credential || typeof credential.password !== 'string' || credential.password.length < 16 || !validatePassword(credential.password)) {
        throw new Error(`Missing or invalid local credentials for ${definition.role}.`);
      }

      let user = await User.findOne({ where: { email: definition.email }, transaction });
      const created = !user;
      let demoFacility;
      if (definition.role === 'hospital' && !user) demoFacility = await resolveSeedDemoFacility(demoAdmin,transaction);
      if (user) {
        // Never overwrite an account, password, or profile someone has edited.
        const matches = user.firstName === definition.firstName && user.lastName === definition.lastName
          && user.role === definition.role && user.isActive && user.emailVerified
          && await bcrypt.compare(credential.password, user.password);
        if (!matches) throw new Error(`Existing ${definition.email} differs from the demo account; it was not modified.`);
      } else {
        user = await User.create({
          ...definition,
          facilityId:demoFacility?.id || null,
          password: await bcrypt.hash(credential.password, getBcryptRounds()),
        }, { transaction });
      }

      if (definition.role === 'admin') demoAdmin = user;
      if (definition.role === 'hospital' && !created) {
        const facility = user.facilityId && await Facility.findByPk(user.facilityId,{transaction});
        if (!facility || facility.hospitalName !== definition.hospitalName || !facility.isActive || !facility.verifiedAt || facility.verifiedBy !== demoAdmin.id) throw new Error('Existing demo hospital needs the explicit scoped repair script; no account was modified');
      }
      if (created) await AuditService.logAction(demoAdmin.id,'DEMO_ACCOUNT_CREATE','Users',user.id,null,{role:user.role,facilityId:user.facilityId},{transaction,actorRole:'admin',source:'local-demo-seed',metadata:{synthetic:true,fixture:'vitalmatch-local-demo'}});

      if (definition.role === 'donor') {
        const profile = await Donor.findOne({ where: { userId: user.id }, transaction });
        if (!profile) {
          const createdProfile = await Donor.create({
            userId: user.id,
            fullName: `${definition.firstName} ${definition.lastName}`,
            dateOfBirth: definition.dateOfBirth,
            gender: definition.gender,
            bloodType: 'O+',
            weight: 70,
            height: 170,
            mobileNumber: definition.phone,
            email: definition.email,
            address: 'Demo address (test data)',
            city: 'Calapan City',
            province: 'Oriental Mindoro',
            zipCode: '5200',
            latitude: 13.4117,
            longitude: 121.1803,
            lastDonationDate: null,
            medicalConditions: '',
            isAvailable: true,
            emergencyContactName: 'Demo Contact (test data)',
            emergencyContactNumber: '09000000005',
            emergencyContactRelationship: 'Sibling',
          }, { transaction });
          await AuditService.logAction(demoAdmin.id,'DEMO_PROFILE_CREATE','Donor',createdProfile.id,null,{bloodType:'O+',synthetic:true},{transaction,actorRole:'admin',source:'local-demo-seed',metadata:{synthetic:true,fixture:'vitalmatch-local-demo'}});
        }
      }
      seeded.push({ role: definition.role, email: definition.email, status: created ? 'created' : 'already exists' });
    }
    return seeded;
  });

  console.table(results);
  console.log(`Login credentials saved locally: ${fileURLToPath(credentialsUrl)}`);
  console.log('All demo accounts are active and email verified. No verification emails were sent.');
} catch (error) {
  // Sequelize errors can include bound password hashes; report only safe messages.
  const message = error.name?.startsWith('Sequelize') ? `Database operation failed (${error.name}).` : error.message;
  console.error(`Demo seed failed: ${message}`);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
