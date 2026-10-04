/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { PublicContent } from "../models/publicContentModel.js";
import { AuditService } from '../services/auditService.js';
import { retryTransaction } from '../services/transactionService.js';
import { sanitizeRichHtml } from "../middleware/validation.js";
import { safeContentUrl } from '../services/contentSafety.js';

export const getAllPublicContent = async (req, res) => {
  try {
    const content = await PublicContent.findAll({
      where: { isActive: true },
      order: [["updatedAt", "DESC"]]
    });

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error("Error fetching public content:", error.name);
    res.status(500).json({
      success: false,
      message: "Error fetching public content"
    });
  }
};

// Get specific section
export const getPublicContentBySection = async (req, res) => {
  try {
    const { section } = req.params;
    const content = await PublicContent.findOne({
      where: { section, isActive: true }
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content section not found"
      });
    }

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error("Error fetching public content:", error.name);
    res.status(500).json({
      success: false,
      message: "Error fetching public content"
    });
  }
};

function cmsInput(body, creating = false) {
  const values = {};
  if (creating) {
    if (typeof body.section !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.section)) throw Object.assign(new Error('Provide a valid section identifier.'),{status:400});
    values.section = body.section;
  }
  for(const field of ['title','subtitle','description','primaryButtonText','secondaryButtonText']) {
    if(body[field] === undefined) continue;
    if(typeof body[field] !== 'string' || body[field].length > (field === 'description' ? 20000 : 1000)) throw Object.assign(new Error('Provide valid content text.'),{status:400});
    values[field] = sanitizeRichHtml(body[field]);
  }
  for(const field of ['primaryButtonLink','secondaryButtonLink','imageUrl']) {
    if(body[field] === undefined) continue;
    try { values[field]=safeContentUrl(body[field],{image:field==='imageUrl'}); } catch {throw Object.assign(new Error('Use a valid local or HTTPS content link.'),{status:400});}
  }
  if(body.isActive !== undefined) {
    if(![true,false,'true','false'].includes(body.isActive)) throw Object.assign(new Error('Choose a valid active status.'),{status:400});
    values.isActive=body.isActive===true || body.isActive==='true';
  } else if(creating) values.isActive=true;
  if(body.metadata !== undefined) {
    if(body.metadata!==null && (typeof body.metadata!=='object' || Array.isArray(body.metadata) || JSON.stringify(body.metadata).length>20000)) throw Object.assign(new Error('Provide valid content metadata.'),{status:400});
    values.metadata=body.metadata;
  }
  return values;
}
async function mutateContent(req,res,mode) {
  try {
    const values=mode==='deactivate' ? {isActive:false} : cmsInput(req.body,mode==='create');
    const content=await retryTransaction(async transaction=>{
      let row;
      if(mode==='create') row=await PublicContent.create(values,{transaction});
      else {
        row=await PublicContent.findOne({where:{section:req.params.section},transaction,lock:transaction.LOCK.UPDATE});
        if(!row) throw Object.assign(new Error('Content section not found'),{status:404});
        await row.update(values,{transaction});
      }
      await AuditService.logAction(req.session.userId,'CMS_'+mode.toUpperCase(),'public_content',row.id,null,{section:row.section,changedFields:Object.keys(values)}, {...AuditService.getRequestContext(req),actorRole:'admin',transaction});
      return row;
    });
    res.status(mode==='create'?201:200).json({success:true,message:mode==='deactivate'?'Public content deactivated successfully':'Public content saved successfully',data:content});
  }catch(error){
    console.error('Public content mutation failed:',error.name);
    const status=error.status || (error.name==='SequelizeUniqueConstraintError'?409:503);
    res.status(status).json({success:false,message:error.status ? error.message : status===409?'Section already exists':'Public content could not be saved. Please retry.'});
  }
}
export const createPublicContent=(req,res)=>mutateContent(req,res,'create');
export const updatePublicContent=(req,res)=>mutateContent(req,res,'update');
export const deletePublicContent=(req,res)=>mutateContent(req,res,'deactivate');

// Admin page to view and manage all public content
export const adminPublicContentPage = async (req, res) => {
  try {
    const content = await PublicContent.findAll({
      order: [["section", "ASC"]]
    });

    res.render("admin-public-cms", {
      layout: "admin",
      title: "Public CMS Management",
      content,
      user: req.user
    });
  } catch (error) {
    console.error("Error loading admin public content page:", error.name);
    res.status(500).render("error", {
      title: "Server Error - VitalMatch",
      statusCode: 500,
      message: "Error loading CMS page. Please try again."
    });
  }
};
