CREATE TABLE job_schedules ( 
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE, 
  job_type    VARCHAR(100) NOT NULL, 
  payload     JSONB, 
  cron_expr   VARCHAR(100),  -- '0 9 * * 1' = every Monday 9am 
  is_active   BOOLEAN DEFAULT true, 
  last_run    TIMESTAMPTZ, 
  next_run    TIMESTAMPTZ, 
  created_at  TIMESTAMPTZ DEFAULT NOW() 
); 
