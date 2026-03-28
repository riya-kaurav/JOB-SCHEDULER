CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(255) DEFAULT 'free', -- free | pro | enterprise
    daily_limit INT DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW()
);