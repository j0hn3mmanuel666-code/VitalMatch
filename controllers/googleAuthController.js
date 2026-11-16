import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { User } from '../models/userModel.js';
import { createGoogleHandlers } from '../services/googleAuth.js';
import { finishLogin } from './authController.js';
import { getBcryptRounds } from '../middleware/validation.js';
import { retryTransaction } from '../services/transactionService.js';
import { AuditService } from '../services/auditService.js';

export const googleAuth = createGoogleHandlers({
  findUser: email => User.findOne({ where: { email } }),
  signIn: finishLogin,
  createUser: async data => {
    const password = await bcrypt.hash(crypto.randomBytes(48).toString('base64url'), getBcryptRounds());
    return retryTransaction(async transaction => {
      const user = await User.create({ ...data, password }, { transaction });
      await AuditService.logAction(user.id, 'ACCOUNT_REGISTER', 'Users', user.id, null, { role: 'donor', isActive: true, emailVerified: true }, { transaction, actorRole: 'unverified', source: 'google-registration', metadata: { actorAuthenticated: false, authorization: 'google-verified-email' } });
      return user;
    });
  }
});
