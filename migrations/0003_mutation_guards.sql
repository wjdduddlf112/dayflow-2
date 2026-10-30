CREATE TABLE MutationGuards(id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid = 1));
CREATE INDEX ai_draft_expiry ON AIActionDrafts(expires_at);
CREATE INDEX request_key_created ON RequestKeys(created_at);
