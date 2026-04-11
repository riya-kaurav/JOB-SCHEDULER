import { Queue } from 'bullmq';
import  redis  from '../cache/redis.js';

const jobQueue = new Queue('jobs', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
    removeOnComplete: false,
    removeOnFail: false
  }
});

// Priority: 1=highest, 10=lowest (BullMQ convention)
export async function enqueueJob(job) {
  const priorityMap = { 1: 1, 2: 5, 3: 10 };

  const delay = job.scheduled_at
    ? Math.max(new Date(job.scheduled_at) - Date.now(), 0)
    : 0;

  return await jobQueue.add(job.type, job, {
    priority: priorityMap[job.priority] ?? 5,
    delay,
    jobId: job.id // idempotency
  });
}







// import { Queue } from 'bullmq';
// import redis from '../cache/redis.js';

// const jobQueue = new Queue('jobs', {
//   connection: redis,
//   defaultJobOptions: {
//     attempts: 3,
//     backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
//     removeOnComplete: false,
//     removeOnFail: false
//   }
// });

// // Priority: 1=highest, 10=lowest (BullMQ convention)
// export async function enqueueJob(job) {
//   const priorityMap = { 1: 1, 2: 5, 3: 10 };

//   const delay = job.scheduled_at
//     ? Math.max(new Date(job.scheduled_at) - Date.now(), 0)
//     : 0;

//   const result = await jobQueue.add(job.type, job, {
//     priority: priorityMap[job.priority] ?? 5,
//     delay,
//     jobId: job.id // idempotency
//   });

//   // Get queue counts after enqueue
//   const counts = await jobQueue.getJobCounts();
//   console.log('Queue counts:', counts);

//   return result;
// }