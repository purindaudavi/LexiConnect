CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMP NOT NULL DEFAULT now(),
    event_type VARCHAR(16) NOT NULL,
    user_id UUID NULL,
    email VARCHAR(255) NULL,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    success BOOLEAN NOT NULL,
    failure_reason TEXT NULL,
    method VARCHAR(32) NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_logs_occurred_at ON auth_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_logs_success ON auth_logs (success);
CREATE INDEX IF NOT EXISTS idx_auth_logs_email ON auth_logs (email);
CREATE INDEX IF NOT EXISTS idx_auth_logs_user_id ON auth_logs (user_id);
