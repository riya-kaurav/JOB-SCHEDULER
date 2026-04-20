import cron from 'node-cron';
import pool from '../db/index.js';
import { enqueueJob } from '../services/queue.service.js';

import {
  loadDueSchedulesForProcessing,
  createJobRecord,
  updateScheduleAfterRun
} from '../services/schedule.service.js';

async function tick() {
  const client = await pool.connect();
  const jobsToEnqueue = [];

  try {
    await client.query('BEGIN');

    const schedules = await loadDueSchedulesForProcessing(client);

    for (const schedule of schedules) {
      const job = await createJobRecord(client, schedule);
      await updateScheduleAfterRun(client, schedule);

      jobsToEnqueue.push(job);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Scheduler tick failed:', err.message);
    return;
  } finally {
    client.release();
  }

  // enqueue AFTER commit
  for (const job of jobsToEnqueue) {
    try {
      await enqueueJob(job);
    } catch (err) {
      console.error(`Enqueue failed for job ${job.id}:`, err.message);
      // safe to retry later if needed
    }
  }
}

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    await tick();
  });

  console.log('Scheduler started');
}