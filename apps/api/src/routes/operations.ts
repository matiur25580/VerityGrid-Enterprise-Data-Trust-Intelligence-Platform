import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRoles, requireTenant } from "../middleware/authenticate";
import { enqueueQualityJob, qualityQueue, deadLetterQueue } from "../lib/quality-worker";
import { enqueueIncidentNotification, notificationQueue } from "../lib/notifications";

export const operationsRouter=Router();
operationsRouter.use(authenticate,requireTenant);
const writer=requireRoles("OWNER","ADMIN","DATA_STEWARD","DATA_ENGINEER");
const admin=requireRoles("OWNER","ADMIN");
const uuid=z.string().uuid();

async function audit(organizationId:string,actorId:string,action:string,entityType:string,entityId:string,metadata:Prisma.InputJsonObject={}) {
  await prisma.auditEvent.create({data:{organizationId,actorId,action,entityType,entityId,metadata}});
}

operationsRouter.post("/quality/:assetId/jobs",writer,async(req,res,next)=>{try{
 const assetId=uuid.safeParse(req.params.assetId); const body=z.object({requestKey:z.string().trim().min(8).max(120).regex(/^[a-zA-Z0-9:_-]+$/)}).safeParse(req.body);
 if(!assetId.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"A valid asset ID and idempotency requestKey are required."}});return;}
 const org=req.tenant!.organizationId; const asset=await prisma.dataAsset.findFirst({where:{id:assetId.data,organizationId:org},select:{id:true}});
 if(!asset){res.status(404).json({error:{code:"ASSET_NOT_FOUND",message:"Dataset not found in this workspace."}});return;}
 const key=org+":"+body.data.requestKey;
 const job=await enqueueQualityJob({organizationId:org,assetId:asset.id,requestedBy:req.auth!.userId,requestKey:key});
 await audit(org,req.auth!.userId,"QUALITY_JOB_QUEUED","DataAsset",asset.id,{jobId:String(job.id)});
 res.status(202).json({data:{jobId:job.id,state:await job.getState(),requestKey:body.data.requestKey}});
}catch(e:any){if(e?.message?.includes("Job")&&e?.message?.includes("exists")){res.status(409).json({error:{code:"IDEMPOTENCY_CONFLICT",message:"This request key is already in use."}});return;}next(e);}});
operationsRouter.get("/jobs/:jobId",async(req,res,next)=>{try{
 const job=await qualityQueue.getJob(req.params.jobId); if(!job||job.data.organizationId!==req.tenant!.organizationId){res.status(404).json({error:{code:"JOB_NOT_FOUND",message:"Job not found in this workspace."}});return;}
 res.json({data:{id:job.id,state:await job.getState(),attemptsMade:job.attemptsMade,processedOn:job.processedOn,finishedOn:job.finishedOn,failedReason:await job.getState()==="failed"?"The validation job failed.":undefined,result:job.returnvalue}});
}catch(e){next(e);}});
operationsRouter.get("/jobs",async(req,res,next)=>{try{
 const [waiting,active,failed,completed]=await Promise.all([qualityQueue.getJobs(["waiting","delayed"],0,49),qualityQueue.getJobs(["active"],0,49),qualityQueue.getJobs(["failed"],0,49),qualityQueue.getJobs(["completed"],0,49)]);
 const jobs=[...waiting,...active,...failed,...completed].filter(j=>j.data.organizationId===req.tenant!.organizationId).map(j=>({id:j.id,assetId:j.data.assetId,state:j.finishedOn?"completed":j.failedReason?"failed":j.processedOn?"active":"waiting",attemptsMade:j.attemptsMade,createdAt:j.timestamp}));
 res.json({data:{jobs,counts:{waiting:waiting.filter(j=>j.data.organizationId===req.tenant!.organizationId).length,active:active.filter(j=>j.data.organizationId===req.tenant!.organizationId).length,failed:failed.filter(j=>j.data.organizationId===req.tenant!.organizationId).length,completed:completed.filter(j=>j.data.organizationId===req.tenant!.organizationId).length}}});
}catch(e){next(e);}});


operationsRouter.get("/notification-deliveries",async(req,res,next)=>{try{
 const org=req.tenant!.organizationId;
 const [waiting,active,delayed,failed,completed]=await Promise.all([
  notificationQueue.getJobs(["waiting"],0,99),notificationQueue.getJobs(["active"],0,99),
  notificationQueue.getJobs(["delayed"],0,99),notificationQueue.getJobs(["failed"],0,99),
  notificationQueue.getJobs(["completed"],0,49)
 ]);
 const own=(jobs:any[])=>jobs.filter(job=>job.data.organizationId===org);
 const jobs=[...own(waiting),...own(active),...own(delayed),...own(failed),...own(completed)]
  .sort((a,b)=>b.timestamp-a.timestamp).slice(0,100)
  .map(job=>({id:job.id,incidentId:job.data.incidentId,severity:job.data.severity,eventKey:job.data.eventKey,state:job.failedReason?"failed":job.finishedOn?"delivered":job.processedOn?"sending":job.delay?"delayed":"queued",attemptsMade:job.attemptsMade,createdAt:new Date(job.timestamp).toISOString(),deliveredAt:job.finishedOn?new Date(job.finishedOn).toISOString():null,errorCode:job.failedReason?String(job.failedReason).slice(0,80):null}));
 res.json({data:{configured:Boolean(process.env.INCIDENT_WEBHOOK_URL?.trim()),provider:process.env.INCIDENT_WEBHOOK_URL?.trim()?"https-webhook":"disabled",counts:{queued:own([...waiting,...delayed]).length,active:own(active).length,failed:own(failed).length,delivered:own(completed).length},jobs}});
}catch(e){next(e);}});
operationsRouter.post("/notification-deliveries/:jobId/retry",admin,async(req,res,next)=>{try{
 const jobId=z.string().min(1).max(200).safeParse(req.params.jobId);
 if(!jobId.success){res.status(400).json({error:{code:"INVALID_NOTIFICATION_ID",message:"Notification ID is invalid."}});return;}
 const job=await notificationQueue.getJob(jobId.data);
 if(!job||job.data.organizationId!==req.tenant!.organizationId){res.status(404).json({error:{code:"NOTIFICATION_NOT_FOUND",message:"Notification delivery not found in this workspace."}});return;}
 if(await job.getState()!=="failed"){res.status(409).json({error:{code:"NOTIFICATION_NOT_FAILED",message:"Only failed notification deliveries can be retried."}});return;}
 await job.retry();
 await audit(req.tenant!.organizationId,req.auth!.userId,"NOTIFICATION_RETRY_REQUESTED","Notification",String(job.id),{incidentId:job.data.incidentId});
 res.status(202).json({data:{jobId:job.id,state:"queued"}});
}catch(e){next(e);}});

operationsRouter.get("/dead-letters",async(req,res,next)=>{try{const jobs=await deadLetterQueue.getJobs(["waiting","failed"],0,99);const items=jobs.filter(j=>j.data.organizationId===req.tenant!.organizationId).map(j=>({id:j.id,assetId:j.data.assetId,failedAt:j.data.failedAt,errorCode:j.data.errorCode}));res.json({data:{deadLetters:items}});}catch(e){next(e);}});
operationsRouter.get("/incidents",async(req,res,next)=>{try{const incidents=await prisma.incident.findMany({where:{organizationId:req.tenant!.organizationId},orderBy:{createdAt:"desc"},take:100,include:{events:{orderBy:{createdAt:"asc"}}}});res.json({data:{incidents}});}catch(e){next(e);}});
operationsRouter.post("/incidents",writer,async(req,res,next)=>{try{
 const body=z.object({title:z.string().trim().min(4).max(180),description:z.string().trim().max(4000).optional(),severity:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]),assetId:uuid.optional(),assigneeId:uuid.optional()}).safeParse(req.body);
 if(!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide a title and valid severity."}});return;}
 if(body.data.assetId&&!await prisma.dataAsset.findFirst({where:{id:body.data.assetId,organizationId:req.tenant!.organizationId}})){res.status(404).json({error:{code:"ASSET_NOT_FOUND",message:"Dataset not found."}});return;}
 if(body.data.assigneeId&&!await prisma.membership.findFirst({where:{organizationId:req.tenant!.organizationId,userId:body.data.assigneeId}})){res.status(400).json({error:{code:"INVALID_ASSIGNEE",message:"Assignee must be a workspace member."}});return;}
 const incident=await prisma.incident.create({data:{...body.data,organizationId:req.tenant!.organizationId,status:"OPEN",createdBy:req.auth!.userId,sourceKey:"manual:"+randomUUID()}});
 await prisma.incidentEvent.create({data:{organizationId:req.tenant!.organizationId,incidentId:incident.id,actorId:req.auth!.userId,eventType:"CREATED",detail:"Incident created."}});
 await enqueueIncidentNotification({organizationId:req.tenant!.organizationId,incidentId:incident.id,severity:incident.severity,eventKey:"manual-created"});
 await audit(req.tenant!.organizationId,req.auth!.userId,"INCIDENT_CREATED","Incident",incident.id,{severity:incident.severity});
 res.status(201).json({data:{incident}});
}catch(e){next(e);}});
operationsRouter.patch("/incidents/:incidentId",writer,async(req,res,next)=>{try{
 const id=uuid.safeParse(req.params.incidentId),body=z.object({status:z.enum(["OPEN","ACKNOWLEDGED","RESOLVED","CLOSED"]).optional(),severity:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).optional(),assigneeId:uuid.nullable().optional(),detail:z.string().trim().min(3).max(1000)}).safeParse(req.body);
 if(!id.success||!body.success||(!body.data.status&&!body.data.severity&&body.data.assigneeId===undefined)){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide a valid incident update and an event detail."}});return;}
 const org=req.tenant!.organizationId;const existing=await prisma.incident.findFirst({where:{id:id.data,organizationId:org}});
 if(!existing){res.status(404).json({error:{code:"INCIDENT_NOT_FOUND",message:"Incident not found."}});return;}
 const allowed:Record<string,string[]>={OPEN:["ACKNOWLEDGED","RESOLVED"],ACKNOWLEDGED:["RESOLVED"],RESOLVED:["CLOSED"],CLOSED:[]};
 if(body.data.status&&body.data.status!==existing.status&&!allowed[existing.status]?.includes(body.data.status)){res.status(409).json({error:{code:"INVALID_INCIDENT_TRANSITION",message:"This incident lifecycle transition is not allowed."}});return;}
 if(body.data.assigneeId&&!await prisma.membership.findFirst({where:{organizationId:org,userId:body.data.assigneeId}})){res.status(400).json({error:{code:"INVALID_ASSIGNEE",message:"Assignee must be a workspace member."}});return;}
 const {detail,...changes}=body.data;const incident=await prisma.incident.update({where:{id:existing.id},data:changes});
 await prisma.incidentEvent.create({data:{organizationId:org,incidentId:incident.id,actorId:req.auth!.userId,eventType:"UPDATED",detail}});
 await audit(org,req.auth!.userId,"INCIDENT_UPDATED","Incident",incident.id,{status:incident.status,severity:incident.severity});
 res.json({data:{incident}});
}catch(e){next(e);}});

operationsRouter.get("/policies",async(req,res,next)=>{try{const policies=await prisma.governancePolicy.findMany({where:{organizationId:req.tenant!.organizationId},orderBy:{createdAt:"desc"},include:{approvals:{orderBy:{createdAt:"desc"}}}});res.json({data:{policies}});}catch(e){next(e);}});
operationsRouter.post("/policies",admin,async(req,res,next)=>{try{
 const body=z.object({name:z.string().trim().min(3).max(160),description:z.string().trim().max(2000).optional(),policyType:z.enum(["CLASSIFICATION_CHANGE","DATA_ACCESS","RETENTION"]),requiresApproval:z.boolean().default(true)}).safeParse(req.body);
 if(!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide a valid governance policy."}});return;}
 const policy=await prisma.governancePolicy.create({data:{...body.data,organizationId:req.tenant!.organizationId,createdBy:req.auth!.userId}});
 await audit(req.tenant!.organizationId,req.auth!.userId,"POLICY_CREATED","GovernancePolicy",policy.id,{policyType:policy.policyType});
 res.status(201).json({data:{policy}});
}catch(e){next(e);}});
operationsRouter.post("/policies/:policyId/approvals",writer,async(req,res,next)=>{try{
 const id=uuid.safeParse(req.params.policyId),body=z.object({request:StringSchema,comment:z.string().trim().max(1000).optional()}).safeParse(req.body);
 if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide a valid approval request."}});return;}
 const org=req.tenant!.organizationId;const policy=await prisma.governancePolicy.findFirst({where:{id:id.data,organizationId:org}});
 if(!policy){res.status(404).json({error:{code:"POLICY_NOT_FOUND",message:"Policy not found."}});return;}
 const approval=await prisma.governanceApproval.create({data:{organizationId:org,policyId:policy.id,requestedBy:req.auth!.userId,requestDescription:body.data.request,decision:"PENDING",comment:body.data.comment}});
 await audit(org,req.auth!.userId,"GOVERNANCE_APPROVAL_REQUESTED","GovernanceApproval",approval.id,{policyId:policy.id});
 res.status(201).json({data:{approval}});
}catch(e){next(e);}});
operationsRouter.patch("/approvals/:approvalId",admin,async(req,res,next)=>{try{
 const id=uuid.safeParse(req.params.approvalId),body=z.object({decision:z.enum(["APPROVED","REJECTED"]),comment:z.string().trim().min(2).max(1000)}).safeParse(req.body);
 if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"A decision and reason are required."}});return;}
 const org=req.tenant!.organizationId;const current=await prisma.governanceApproval.findFirst({where:{id:id.data,organizationId:org}});
 if(!current){res.status(404).json({error:{code:"APPROVAL_NOT_FOUND",message:"Approval not found."}});return;}
 if(current.requestedBy===req.auth!.userId){res.status(403).json({error:{code:"SELF_APPROVAL_DENIED",message:"A requester cannot decide their own approval."}});return;}
 if(current.decision!=="PENDING"){res.status(409).json({error:{code:"APPROVAL_FINALIZED",message:"This approval has already been decided."}});return;}
 const approval=await prisma.governanceApproval.update({where:{id:current.id},data:{decision:body.data.decision,comment:body.data.comment,decidedBy:req.auth!.userId,decidedAt:new Date()}});
 await audit(org,req.auth!.userId,"GOVERNANCE_APPROVAL_DECIDED","GovernanceApproval",approval.id,{decision:approval.decision});
 res.json({data:{approval}});
}catch(e){next(e);}});
operationsRouter.get("/audit",admin,async(req,res,next)=>{try{const events=await prisma.auditEvent.findMany({where:{organizationId:req.tenant!.organizationId},orderBy:{createdAt:"desc"},take:200});res.json({data:{events}});}catch(e){next(e);}});
const StringSchema=z.string().trim().min(8).max(4000);
