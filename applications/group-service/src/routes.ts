import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { app, db, actor, fail, internal, uuid, validate } from "./common";

const groupSchema = z.object({
    name: z.string().trim().min(2).max(150), description: z.string().max(2000).default(""),
    visibility: z.enum(["PUBLIC", "PRIVATE"]), joinPolicy: z.enum(["OPEN", "APPROVAL", "PASSWORD"]),
    password: z.string().min(8).optional()
}).superRefine((v, ctx) => {
    if (v.visibility === "PUBLIC" && v.joinPolicy !== "OPEN") ctx.addIssue({ code: "custom", message: "Public group requires OPEN" });
    if (v.visibility === "PRIVATE" && v.joinPolicy === "OPEN") ctx.addIssue({ code: "custom", message: "Private group requires APPROVAL or PASSWORD" });
    if (v.joinPolicy === "PASSWORD" && !v.password) ctx.addIssue({ code: "custom", message: "Password required" });
});
const getGroup = async (id: string): Promise<any> => {
    const result = await db.query("SELECT * FROM groups WHERE id=$1", [id]);
    if (!result.rows[0]) fail(404, "Group not found");
    return result.rows[0];
};
const member = async (groupId: string, userId: string): Promise<any> =>
    (await db.query("SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2", [groupId, userId])).rows[0];
const requireAdmin = async (groupId: string, userId: string): Promise<void> => {
    if ((await member(groupId, userId))?.role !== "ADMIN") fail(403, "Group admin required");
};
const publicGroup = (g: any): any => ({ id: g.id, name: g.name, description: g.description, groupCode: g.code, visibility: g.visibility, joinPolicy: g.join_policy, ownerId: g.owner_id, createdAt: g.created_at });

app.post("/api/groups", async (c) => {
    const input = validate(groupSchema, await c.req.json());
    const id: string = randomUUID();
    const code: string = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    const userId: string = actor(c).userId;
    const hash: string | null = input.joinPolicy === "PASSWORD" ? await bcrypt.hash(input.password!, 12) : null;
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("INSERT INTO groups(id,name,description,code,visibility,join_policy,password_hash,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [id,input.name,input.description,code,input.visibility,input.joinPolicy,hash,userId]);
        await client.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'ADMIN')", [id,userId]);
        await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    return c.json(publicGroup(await getGroup(id)), 201);
});
app.get("/api/groups/code/:code", async (c) => {
    const result = await db.query("SELECT * FROM groups WHERE code=$1", [c.req.param("code").toUpperCase()]);
    if (!result.rows[0]) fail(404, "Group not found");
    return c.json(publicGroup(result.rows[0]));
});
app.get("/api/groups/:id", async (c) => {
    const id = validate(uuid, c.req.param("id"));
    const group = await getGroup(id);
    if (group.visibility === "PRIVATE" && !(await member(id, actor(c).userId))) fail(403, "Group membership required");
    return c.json(publicGroup(group));
});
app.get("/api/groups", async (c) => {
    const result = await db.query("SELECT * FROM groups WHERE visibility='PUBLIC' OR id IN (SELECT group_id FROM group_members WHERE user_id=$1) ORDER BY created_at DESC LIMIT 100", [actor(c).userId]);
    return c.json(result.rows.map(publicGroup));
});
app.post("/api/groups/:id/join", async (c) => {
    const id = validate(uuid, c.req.param("id"));
    const group = await getGroup(id);
    const userId = actor(c).userId;
    if (await member(id,userId)) fail(409, "Already a member");
    const input = validate(z.object({ password: z.string().optional() }), await c.req.json().catch(() => ({})));
    if (group.join_policy === "APPROVAL") fail(403, "Approval request required");
    if (group.join_policy === "PASSWORD" && (!input.password || !(await bcrypt.compare(input.password,group.password_hash)))) fail(403, "Invalid password");
    await db.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'MEMBER') ON CONFLICT DO NOTHING", [id,userId]);
    return c.json({ groupId:id, userId, role:"MEMBER", status:"ACTIVE" }, 201);
});
app.post("/api/groups/:id/requests", async (c) => {
    const id = validate(uuid,c.req.param("id"));
    const group = await getGroup(id);
    if (group.join_policy !== "APPROVAL") fail(403, "Group does not accept approval requests");
    const userId = actor(c).userId;
    if (await member(id,userId)) fail(409, "Already a member");
    const input = validate(z.object({message:z.string().max(500).default("")}),await c.req.json().catch(() => ({})));
    const requestId = randomUUID();
    const result = await db.query("INSERT INTO join_requests(id,group_id,user_id,message,status) VALUES($1,$2,$3,$4,'PENDING') ON CONFLICT(group_id,user_id) DO NOTHING RETURNING id",[requestId,id,userId,input.message]);
    if (!result.rowCount) fail(409,"Request already exists");
    return c.json({requestId,groupId:id,userId,status:"PENDING"},201);
});
app.get("/api/groups/:id/requests", async (c) => {
    const id = validate(uuid,c.req.param("id")); await requireAdmin(id,actor(c).userId);
    return c.json((await db.query("SELECT id,user_id,message,status,created_at FROM join_requests WHERE group_id=$1 ORDER BY created_at DESC",[id])).rows);
});
app.patch("/api/groups/:id/requests/:requestId", async (c) => {
    const id = validate(uuid,c.req.param("id")); const requestId = validate(uuid,c.req.param("requestId"));
    await requireAdmin(id,actor(c).userId);
    const input = validate(z.object({decision:z.enum(["APPROVED","REJECTED"])}),await c.req.json());
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query("UPDATE join_requests SET status=$1,decided_at=now() WHERE id=$2 AND group_id=$3 AND status='PENDING' RETURNING user_id",[input.decision,requestId,id]);
        if (!result.rowCount) fail(409,"Request missing or already processed");
        if (input.decision === "APPROVED") await client.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'MEMBER') ON CONFLICT DO NOTHING",[id,result.rows[0].user_id]);
        await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally {client.release();}
    return c.json({requestId,status:input.decision,memberCreated:input.decision === "APPROVED"});
});
app.get("/api/groups/:id/members", async (c) => {
    const id = validate(uuid,c.req.param("id"));
    if (!(await member(id,actor(c).userId))) fail(403,"Membership required");
    return c.json((await db.query("SELECT user_id,role,joined_at FROM group_members WHERE group_id=$1 ORDER BY joined_at",[id])).rows);
});
app.delete("/api/groups/:id/members/:userId", async (c) => {
    const id = validate(uuid,c.req.param("id")); await requireAdmin(id,actor(c).userId);
    const userId = c.req.param("userId"); const group = await getGroup(id);
    if (group.owner_id === userId) fail(403,"Cannot remove owner");
    const result = await db.query("DELETE FROM group_members WHERE group_id=$1 AND user_id=$2",[id,userId]);
    if (!result.rowCount) fail(404,"Member not found");
    return c.json({removed:true});
});
app.patch("/api/groups/:id", async (c) => {
    const id = validate(uuid,c.req.param("id")); await requireAdmin(id,actor(c).userId);
    const input = validate(z.object({name:z.string().trim().min(2).max(150).optional(),description:z.string().max(2000).optional()}).refine(v=>Object.keys(v).length>0),await c.req.json());
    const result = await db.query("UPDATE groups SET name=COALESCE($2,name),description=COALESCE($3,description) WHERE id=$1 RETURNING *",[id,input.name??null,input.description??null]);
    return c.json(publicGroup(result.rows[0]));
});
app.post("/api/groups/:id/leave", async (c) => {
    const id = validate(uuid,c.req.param("id")); const group = await getGroup(id);
    if (group.owner_id === actor(c).userId) fail(403,"Owner cannot leave");
    const result = await db.query("DELETE FROM group_members WHERE group_id=$1 AND user_id=$2",[id,actor(c).userId]);
    if (!result.rowCount) fail(404,"Not a member");
    return c.json({left:true});
});
app.get("/internal/groups/:id/members/:userId", async (c) => {
    internal(c);
    const id = validate(uuid,c.req.param("id"));
    const group = await getGroup(id);
    const record = await member(id,c.req.param("userId"));
    return c.json({groupId:id,userId:c.req.param("userId"),isMember:!!record,isAdmin:record?.role === "ADMIN",role:record?.role??null,visibility:group.visibility});
});
