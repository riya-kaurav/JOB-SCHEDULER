import { Queue } from 'bullmq';
import redis from '../cache/redis.js';

export const jobQueue = new Queue('jobs', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: false,
    removeOnFail: false,
  }
});

// Priority: 1=highest, 10=lowest
export async function enqueueJob(job) {
  const priorityMap = { 1: 1, 2: 5, 3: 10 };

  const delay = job.scheduled_at
    ? Math.max(new Date(job.scheduled_at) - Date.now(), 0)
    : 0;

  return await jobQueue.add(
    job.type,
    {
      dbJobId: job.id,
      payload: job.payload,
      tenantId: job.tenant_id
    },
    {
      priority: priorityMap[job.priority] ?? 5,
      delay,
      jobId: job.id // idempotency
    }
  );
}