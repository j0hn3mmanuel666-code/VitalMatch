import { sequelize } from './models/db.js';

async function check() {
  try {
    const [results, metadata] = await sequelize.query("DESCRIBE BloodRequests;");
    console.log(results);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
