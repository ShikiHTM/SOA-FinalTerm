import { randomUUID } from "node:crypto";
import { z } from "zod";
import { app, db, actor, fail, internal, uuid, validate } from "./common";
const contestSchema = z.object({
    title:z.string().trim().min(2).max(150), description:z.string().max(2000).default(""),
    groupId:uuid, problemId:z.string().min(1),
    startTime:z.string().datetime({offset:true}), endTime:z.string().datetime({offset:true}),
    submissionPolicy:z.enum(["SINGLE","MULTIPLE"]), published:z.boolean().default(false)
}).refine(v=>new Date(v.startTime).getTime()<new Date(v.endTime).getTime(),{message:"startTime must precede endTime"});
const groupUrl: string = process.env.GROUP_SERVICE_URL ?? "http://localhost:5105";
async function membership(groupId:string,userId:string):Promise<{isMember:boolean;isAdmin:boolean}> {
    let response:Response;
    try {
        response = await fetch(`${groupUrl}/internal/groups/${groupId}/members/${encodeURIComponent(userId)}`,{
            headers:{"x-internal-secret":process.env.INTERNAL_SERVICE_SECRET??""},signal:AbortSignal.timeout(4000)
        });
    } catch { return fail(503,"Group Service unavailable"); }
    if (response.status===404) fail(404,"Group not found");
    if (!response.ok) fail(503,"Group Service error");
    return await response.json() as {isMember:boolean;isAdmin:boolean};
}
const getContest = async (id:string):Promise<any> => {
    const result=await db.query("SELECT * FROM contests WHERE id=$1",[id]);
    if (!result.rows[0]) fail(404,"Contest not found");
    return result.rows[0];
};
const state = (v:any):string => {
    if (v.cancelled) return "CANCELLED";
    const now=Date.now();
    return now < new Date(v.start_time).getTime() ? "UPCOMING" : now >= new Date(v.end_time).getTime() ? "ENDED" : "ONGOING";
};
const dto = (v:any):any => ({id:v.id,title:v.title,description:v.description,groupId:v.group_id,problemId:v.problem_id,organizerId:v.organizer_id,startTime:v.start_time,endTime:v.end_time,submissionPolicy:v.submission_policy,published:v.published,status:state(v)});
async function canManage(v:any,userId:string):Promise<void> {
    if (!(await membership(v.group_id,userId)).isAdmin) fail(403,"Group admin required");
};
async function canView(v:any,userId:string):Promise<void> {
    if (!(await membership(v.group_id,userId)).isMember) fail(403,"Group membership required");
    if (!v.published && !(await membership(v.group_id,userId)).isAdmin) fail(403,"Contest not published");
};
app.post("/api/contests",async c=>{
    const input=validate(contestSchema,await c.req.json());
    if (!(await membership(input.groupId,actor(c).userId)).isAdmin) fail(403,"Group admin required");
    const id=randomUUID();
    const result=await db.query("INSERT INTO contests(id,title,description,group_id,problem_id,organizer_id,start_time,end_time,submission_policy,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[id,input.title,input.description,input.groupId,input.problemId,actor(c).userId,input.startTime,input.endTime,input.submissionPolicy,input.published]);
    return c.json(dto(result.rows[0]),201);
});
app.get("/api/contests",async c=>{
    const groupId=validate(uuid,c.req.query("groupId"));
    const access=await membership(groupId,actor(c).userId);
    if (!access.isMember) fail(403,"Membership required");
    const result=await db.query("SELECT * FROM contests WHERE group_id=$1 AND (published=true OR $2=true) ORDER BY start_time DESC LIMIT 100",[groupId,access.isAdmin]);
    return c.json(result.rows.map(dto));
});
app.get("/api/contests/:id",async c=>{
    const v=await getContest(validate(uuid,c.req.param("id")));
    await canView(v,actor(c).userId);
    return c.json(dto(v));
});
app.patch("/api/contests/:id",async c=>{
    const v=await getContest(validate(uuid,c.req.param("id")));
    await canManage(v,actor(c).userId);
    if (state(v)!=="UPCOMING") fail(409,"Only upcoming contests may be edited");
    const input=validate(z.object({title:z.string().trim().min(2).max(150).optional(),description:z.string().max(2000).optional(),startTime:z.string().datetime({offset:true}).optional(),endTime:z.string().datetime({offset:true}).optional(),submissionPolicy:z.enum(["SINGLE","MULTIPLE"]).optional(),published:z.boolean().optional()}).refine(x=>Object.keys(x).length>0),await c.req.json());
    const start=input.startTime??v.start_time.toISOString(); const end=input.endTime??v.end_time.toISOString();
    if (new Date(start).getTime()>=new Date(end).getTime()) fail(400,"Invalid time window");
    const result=await db.query("UPDATE contests SET title=COALESCE($2,title),description=COALESCE($3,description),start_time=$4,end_time=$5,submission_policy=COALESCE($6,submission_policy),published=COALESCE($7,published),updated_at=now() WHERE id=$1 RETURNING *",[v.id,input.title??null,input.description??null,start,end,input.submissionPolicy??null,input.published??null]);
    return c.json(dto(result.rows[0]));
});
app.post("/api/contests/:id/cancel",async c=>{
    const v=await getContest(validate(uuid,c.req.param("id")));
    await canManage(v,actor(c).userId);
    if (state(v)==="ENDED") fail(409,"Contest already ended");
    await db.query("UPDATE contests SET cancelled=true,updated_at=now() WHERE id=$1",[v.id]);
    return c.json({id:v.id,status:"CANCELLED"});
});
app.get("/api/contests/:id/status",async c=>{
    const v=await getContest(validate(uuid,c.req.param("id")));
    await canView(v,actor(c).userId);
    return c.json({contestId:v.id,status:state(v),isWithinWindow:state(v)==="ONGOING"});
});
app.get("/api/contests/:id/access",async c=>{
    const v=await getContest(validate(uuid,c.req.param("id")));
    const access=await membership(v.group_id,actor(c).userId);
    const canAccess=access.isMember && (v.published || access.isAdmin) && !v.cancelled;
    return c.json({contestId:v.id,userId:actor(c).userId,isGroupMember:access.isMember,canAccess,canSubmit:canAccess&&state(v)==="ONGOING"});
});
app.get("/internal/contests/:id/submission-policy",async c=>{
    internal(c);
    const v=await getContest(validate(uuid,c.req.param("id")));
const userId = c.req.query("userId");

if (!userId) {
    return fail(400, "userId query parameter required");
}

const access = await membership(v.group_id, userId);
    const canSubmit=access.isMember&&v.published&&state(v)==="ONGOING";
    return c.json({contestId:v.id,groupId:v.group_id,problemId:v.problem_id,startTime:v.start_time,endTime:v.end_time,status:state(v),submissionPolicy:v.submission_policy,evaluationRule:v.submission_policy==="MULTIPLE"?"FINAL_ATTEMPT_ONLY":"SINGLE_ATTEMPT",canSubmit});
});
