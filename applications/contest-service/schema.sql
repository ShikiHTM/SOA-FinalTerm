CREATE TABLE IF NOT EXISTS contests (
 id UUID PRIMARY KEY, group_id UUID NOT NULL, problem_id TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', organizer_id TEXT NOT NULL,
 start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL,
 submission_policy TEXT NOT NULL CHECK(submission_policy IN ('SINGLE','MULTIPLE')),
 published BOOLEAN NOT NULL DEFAULT FALSE, cancelled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(start_time < end_time)
);
CREATE INDEX IF NOT EXISTS idx_contests_group ON contests(group_id);
