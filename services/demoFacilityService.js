import { User } from '../models/userModel.js';
import { Facility } from '../models/facilityModel.js';
import { UserService } from './userService.js';
import { assertCurrentSchema } from '../scripts/migrate-schema.js';
import { resolveAdminFacility } from './facilityService.js';
import { DEMO_ADMIN_EMAIL, DEMO_HOSPITAL_EMAIL, DEMO_FACILITY_NAME, assertLocalDemoEnvironment, matchesKnownDemoAccount } from './demoAccountPolicy.js';

const identityFields = ['id','email','firstName','lastName','phone','address','dateOfBirth','gender','role','hospitalName','facilityId','isActive','emailVerified','archivedAt'];
async function matchesSyntheticAssignment(hospital,admin,transaction) {
  const facility = hospital.facilityId ? await Facility.findByPk(hospital.facilityId,{transaction}) : await Facility.findOne({where:{hospitalName:DEMO_FACILITY_NAME},transaction});
  if (!hospital.facilityId && !facility) return true;
  return !!facility && facility.hospitalName === DEMO_FACILITY_NAME && facility.isActive && !!facility.verifiedAt && facility.verifiedBy === admin.id;
}
export async function resolveSeedDemoFacility(admin,transaction) {
  if (!matchesKnownDemoAccount(admin,'admin') || !await matchesSyntheticAssignment({facilityId:null},admin,transaction)) throw new Error('Known synthetic demo facility does not match; nothing was changed');
  return resolveAdminFacility({hospitalName:DEMO_FACILITY_NAME,adminId:admin.id},transaction);
}
export async function inspectKnownDemoFacility({env=process.env} = {}) {
  assertLocalDemoEnvironment(env); await assertCurrentSchema();
  const [admin,hospital] = await Promise.all([
    User.findOne({where:{email:DEMO_ADMIN_EMAIL},attributes:identityFields}),
    User.findOne({where:{email:DEMO_HOSPITAL_EMAIL},attributes:identityFields})
  ]);
  const matches = matchesKnownDemoAccount(admin,'admin') && matchesKnownDemoAccount(hospital,'hospital');
  const eligible = !!matches && await matchesSyntheticAssignment(hospital,admin);
  return {eligible,alreadyAssigned:!!eligible && !!hospital.facilityId};
}
export async function repairKnownDemoFacility({env=process.env} = {}) {
  assertLocalDemoEnvironment(env); await assertCurrentSchema();
  const hospital = await User.findOne({where:{email:DEMO_HOSPITAL_EMAIL},attributes:['id']});
  const admin = await User.findOne({where:{email:DEMO_ADMIN_EMAIL},attributes:['id']});
  if (!hospital || !admin) throw new Error('Known synthetic demo accounts do not match; nothing was changed');
  const result = await UserService.updateUser(hospital.id,{role:'hospital',hospitalName:DEMO_FACILITY_NAME},admin.id,{
    source:'local-demo-facility-repair',actorRole:'admin',
    metadata:{synthetic:true,fixture:'vitalmatch-local-demo',purpose:'administrator assignment of a synthetic demo facility'},
    validateTarget:async(target,transaction) => {
      const currentAdmin = await User.findByPk(admin.id,{transaction,lock:transaction.LOCK.UPDATE});
      if (!matchesKnownDemoAccount(target,'hospital') || !matchesKnownDemoAccount(currentAdmin,'admin') || !await matchesSyntheticAssignment(target,currentAdmin,transaction)) {
        throw new Error('Known synthetic demo accounts do not match; nothing was changed');
      }
    }
  });
  return {changed:Object.keys(result.changes).length > 0,facilityAssigned:!!result.user.facilityId};
}
