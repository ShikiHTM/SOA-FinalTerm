CREATE TABLE IF NOT EXISTS groups (
 id UUID PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 code TEXT NOT NULL UNIQUE, visibility TEXT NOT NULL CHECK(visibility IN ('PUBLIC','PRIVATE')),
 join_policy TEXT NOT NULL CHECK(join_policy IN ('OPEN','APPROVAL','PASSWORD')),
 password_hash TEXT, owner_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((visibility='PUBLIC' AND join_policy='OPEN' AND password_hash IS NULL) OR
        (visibility='PRIVATE' AND join_policy='APPROVAL' AND password_hash IS NULL) OR
        (visibility='PRIVATE' AND join_policy='PASSWORD' AND password_hash IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS group_members (
 group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('ADMIN','MEMBER')),
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(group_id,user_id)
);
CREATE TABLE IF NOT EXISTS join_requests (
 id UUID PRIMARY KEY, group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ,
 UNIQUE(group_id,user_id)
);
