import { sequelize } from '../models/db.js';
// Retry the entire rolled-back operation, never an isolated statement. These
// MySQL errors cannot leave a successfully committed application transaction.
export async function retryTransaction(operation, { attempts = 3, database = sequelize } = {}) {
  for (let attempt=0; ; attempt++) {
    try { return await database.transaction(operation); }
    catch(error) {
      const code=error.original?.code || error.parent?.code;
      if (!['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(code) || attempt >= attempts-1) throw error;
      await new Promise(resolve=>setTimeout(resolve,10*(attempt+1)));
    }
  }
}
