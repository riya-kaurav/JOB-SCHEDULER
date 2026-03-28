CREATE TABLE job_executions ( 
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE, 
  attempt     INT NOT NULL, 
  status      VARCHAR(50),  -- success | failed | timeout 
  error       TEXT, 
  duration_ms INT, 
  executed_at TIMESTAMPTZ DEFAULT NOW() 
); 