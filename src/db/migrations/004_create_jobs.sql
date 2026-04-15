CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT  gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, --'EMAIL | 'REPORT' | 'BACKUP'
    payload JSONB,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING | RUNNING | COMPLETED | FAILED
    priority INT DEFAULT 2,
    max_retries INT DEFAULT 3,
    retry_count INT DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);




CREATE INDEX idx_jobs_tenant ON jobs(tenant_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);