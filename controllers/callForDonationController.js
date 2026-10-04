import { searchTerm, withTextSearch, recordPage } from '../services/recordSearch.js';
﻿import { CallForDonation } from '../models/callForDonationModel.js';
import { AuditService } from '../services/auditService.js';
import { sequelize } from '../models/db.js';
import { paginationFor, paginationLinks } from '../services/pagination.js';
import { User } from '../models/userModel.js';
import { Donor } from '../models/donorModel.js';
const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max ? v.trim() : null;
export const submitCall = async (req,res) => {
  const b = req.body;
  const age = Number(b.age), weight = Number(b.weight);
  if (!text(b.fullName,2,200) || !Number.isInteger(age) || age < 1 || age > 120 || !Number.isFinite(weight) || weight < 1 || weight > 500 ||
      !['A+','A-','B+','B-','AB+','AB-','O+','O-','Any'].includes(b.bloodType) || !['Male','Female','Other','male','female','other'].includes(b.gender) ||
      !text(b.contactNumber,7,30) || !/^[+\d\s()-]+$/.test(b.contactNumber) || !['Yes','No','yes','no','Not Applicable'].includes(b.hasTattoo) || !text(b.location,2,255) || (b.message && !text(b.message,0,2000))) {
    req.flash('error_msg','Provide valid contact details and preliminary donor information. Medical staff will assess eligibility.');
    return res.redirect('/#call-for-donation-section');
  }
  await CallForDonation.create({ fullName:b.fullName.trim(),age,weight:String(weight),bloodType:b.bloodType,gender:b.gender,contactNumber:b.contactNumber.trim(),hasTattoo:b.hasTattoo,location:b.location.trim(),message:b.message?.trim() || null,userId:req.session.userId || null });
  res.redirect('/?success=call');
};
export const adminViewCalls = async (req,res) => {
  const filter = typeof req.query.filter === 'string' ? req.query.filter : '';
  const statuses = { pending:'Pending',contacted:'Contacted',converted:'Converted',closed:'Closed' };
  const where = statuses[filter] ? { status:statuses[filter] } : {};
  const search = searchTerm(req.query);
  const searchedWhere = withTextSearch(where,search,['fullName','bloodType','contactNumber','location','message','contactNotes']);
  const total = await CallForDonation.count({ where: searchedWhere });
  const pagination = paginationLinks(paginationFor(req.query,total),req.path,req.query);
  const calls = await CallForDonation.findAll({ where: searchedWhere,order:[['createdAt','DESC']],limit:pagination.limit,offset:pagination.offset });
  res.render('admin-calls',{layout:'admin',title:'Call for Donations - Admin',calls:calls.map(c=>c.toJSON()),filter,search,pagination});
};
export const adminUpdateCallStatus = async (req,res) => {
  const { id,status,contactNotes,convertedUserId } = req.body;
  if (!/^\d+$/.test(String(id)) || !['Pending','Contacted','Converted','Closed'].includes(status) || (contactNotes !== undefined && !text(contactNotes,0,2000))) return res.status(400).json({success:false,message:'Choose a valid lead status and contact note.'});
  const updated = await sequelize.transaction(async transaction => {
    const lead = await CallForDonation.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
    if (!lead) return false;
    const values = {status,...(contactNotes !== undefined ? {contactNotes:contactNotes.trim()} : {}),...(status==='Contacted' ? {contactedAt:new Date(),contactedBy:req.session.userId} : {})};
    if (status === 'Converted') {
      const donorUserId = convertedUserId || lead.convertedUserId;
      if (!/^\d+$/.test(String(donorUserId))) return 'invalid_conversion';
      const account = await User.findOne({where:{id:Number(donorUserId),isActive:true,emailVerified:true,archivedAt:null},transaction});
      const donor = account && await Donor.findOne({where:{userId:account.id},transaction});
      if (!donor) return 'invalid_conversion';
      values.convertedUserId = account.id;
      values.convertedAt = lead.convertedUserId === account.id ? lead.convertedAt || new Date() : new Date();
    }
    await AuditService.logAction(req.session.userId,'DONOR_LEAD_UPDATE','CallForDonations',lead.id,{status:lead.status},values,{...AuditService.getRequestContext(req),transaction});
    await lead.update(values,{transaction}); return true;
  });
  if (updated === 'invalid_conversion') return res.status(400).json({success:false,message:'Link an active, verified account with a donor profile before marking this lead converted.'});
  res.status(updated?200:404).json({success:updated,message:updated?'Lead updated.':'Lead not found.'});
};
