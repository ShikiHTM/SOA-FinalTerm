import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let vite;
let permissions;

before(async () => {
    vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
    permissions = await vite.ssrLoadModule("/src/authorization/permissions.ts");
});

after(async () => {
    await vite?.close();
});

test("permissions differ between visitor, member, moderator and owner", () => {
    const { hasGroupPermission } = permissions;
    assert.equal(hasGroupPermission("VISITOR", "VIEW_PRIVATE_CONTENT"), false);
    assert.equal(hasGroupPermission("MEMBER", "VIEW_PRIVATE_CONTENT"), true);
    assert.equal(hasGroupPermission("MEMBER", "MANAGE_CONTENT"), false);
    assert.equal(hasGroupPermission("MODERATOR", "MANAGE_CONTENT"), true);
    assert.equal(hasGroupPermission("MODERATOR", "TRANSFER_OWNERSHIP"), false);
    assert.equal(hasGroupPermission("OWNER", "TRANSFER_OWNERSHIP"), true);
    assert.equal(hasGroupPermission("UNKNOWN", "MANAGE_SETTINGS"), false);
});

test("visibility and group membership both affect viewing", () => {
    const { canViewGroupContent } = permissions;
    assert.equal(canViewGroupContent("PUBLIC", "VISITOR"), true);
    assert.equal(canViewGroupContent("PRIVATE", "VISITOR"), false);
    assert.equal(canViewGroupContent("PRIVATE", "MEMBER"), true);
    assert.equal(canViewGroupContent("PRIVATE", "OWNER"), true);
});

test("member management distinguishes members, moderators and owners", () => {
    const { canManageMember } = permissions;
    assert.equal(canManageMember("MEMBER", "MEMBER"), false);
    assert.equal(canManageMember("MODERATOR", "MEMBER"), true);
    assert.equal(canManageMember("MODERATOR", "MODERATOR"), false);
    assert.equal(canManageMember("OWNER", "MODERATOR"), true);
    assert.equal(canManageMember("OWNER", "OWNER"), false);
    assert.equal(canManageMember("OWNER", "VISITOR"), false);
});

test("only system admin gets the admin interface permission", () => {
    const { hasSystemPermission } = permissions;
    assert.equal(hasSystemPermission("GUEST", "ACCESS_ADMIN"), false);
    assert.equal(hasSystemPermission("USER", "ACCESS_ADMIN"), false);
    assert.equal(hasSystemPermission("ADMIN", "ACCESS_ADMIN"), true);
    assert.equal(hasSystemPermission("UNKNOWN", "ACCESS_ADMIN"), false);
});
