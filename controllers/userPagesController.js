import { searchTerm, withTextSearch, recordPage } from '../services/recordSearch.js';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { Donor } from '../models/donorModel.js';
import { Fulfillment } from '../models/workflowEventModel.js';
import { RED_CROSS_PINS } from '../services/mindoroGeo.js';
import { donationIntervalDays } from '../services/coordinationPolicy.js';
export const historyPage = async (req,res) => {
  const userId=req.session.userId;
  const search=searchTerm(req.query);
  const total=await BloodRequest.count({where:{userId}});
  const { rows: requests, pagination }=await recordPage(BloodRequest,{where:withTextSearch({userId},search,['patientName','hospitalName','bloodType','city']),order:[['createdAt','DESC']]},req.query,req.path);
  const [donor,fulfilledCount]=await Promise.all([
    Donor.findOne({where:{userId}}),BloodRequest.count({where:{userId,status:'fulfilled'}})
  ]);
  let donations=[],totalDonations=0,unitsCollected=0,donationPagination;
  if (donor) {
    const where={donorId:donor.id};
    [totalDonations,unitsCollected]=await Promise.all([Fulfillment.count({where}),Fulfillment.sum('unitsProvided',{where})]);
    const result=await recordPage(Fulfillment,{where:withTextSearch(where,search,['$BloodRequest.hospitalName$','$BloodRequest.bloodType$','$BloodRequest.city$'],'requestId'),include:[{model:BloodRequest,required:true,attributes:['bloodType','hospitalName']}],order:[['fulfilledAt','DESC']]},req.query,req.path,'donationPage');
    const records=result.rows; donationPagination=result.pagination;
    donations=records.map(r=>({id:r.requestId,fulfillmentId:r.id,bloodType:r.BloodRequest?.bloodType,hospitalName:r.BloodRequest?.hospitalName,unitsRequired:r.unitsProvided,unitsProvided:r.unitsProvided,updatedAt:r.fulfilledAt,fulfilledAt:r.fulfilledAt}));
  }
  res.render('history',{title:'History - VitalMatch',requests,donations,pagination,donationPagination,search,summary:{totalRequests:total,fulfilledRequests:fulfilledCount,totalDonations,unitsCollected:unitsCollected||0}});
};
export const helpPage=(req,res)=>res.render('help',{title:'Help and Support - VitalMatch',chapters:RED_CROSS_PINS,coordinationIntervalDays:donationIntervalDays()});
