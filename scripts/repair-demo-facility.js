import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const {sequelize} = await import('../models/db.js');
const {inspectKnownDemoFacility,repairKnownDemoFacility} = await import('../services/demoFacilityService.js');
try {
  if (process.argv.includes('--apply')) {
    const result = await repairKnownDemoFacility();
    console.log(JSON.stringify(result));
    console.log(result.changed ? 'Known synthetic hospital assigned by the demo administrator. Existing account/profile data was preserved.' : 'Known synthetic demo facility assignment already exists. No account changes were made.');
  } else {
    console.log(JSON.stringify(await inspectKnownDemoFacility()));
    console.log('Read-only fixture check. Use --apply only for the exact known local demo accounts.');
  }
} catch(error) {
  console.error(error.name?.startsWith('Sequelize') ? 'Demo repair failed: database operation unavailable.' : 'Demo repair refused: '+error.message);
  process.exitCode = 1;
} finally {await sequelize.close();}
