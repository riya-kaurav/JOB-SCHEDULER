import { Worker } from "bullmq";
import redis from "../cache/redis.js";
import pool from "../db/index.js";

import { emailHandler } from "./handlers/email.handler.js";
import { reportHandler } from "./handlers/report.handler.js";

const handlers = {
  email: emailHandler,
  report: reportHandler,
};

const worker = new Worker(
  "jobs",
  async (job) => {
    console.log("Processing job:", job.name, job.data);

    const handler = handlers[job.name];
    if (!handler) {
      throw new Error(`No handler for job type: ${job.name}`);
    }

    const jobId = job.data.dbJobId;
    const startTime = Date.now();

    try {
      // RUNNING
      await pool.query(
        `UPDATE jobs SET status = $1 WHERE id = $2`,
        ["RUNNING", jobId]
      );

      await handler(job);

      const duration = Date.now() - startTime;

      // SUCCESS LOG
      await pool.query(
        `INSERT INTO job_executions 
        (job_id, attempt, status, duration_ms) 
        VALUES ($1, $2, $3, $4)`,
        [jobId, job.attemptsMade + 1, "success", duration]
      );

      // COMPLETED
      await pool.query(
        `UPDATE jobs 
         SET status = $1, completed_at = NOW() 
         WHERE id = $2`,
        ["COMPLETED", jobId]
      );

    } catch (error) {
      const duration = Date.now() - startTime;

      // FAILURE LOG
      await pool.query(
        `INSERT INTO job_executions 
        (job_id, attempt, status, error, duration_ms) 
        VALUES ($1, $2, $3, $4, $5)`,
        [
          jobId,
          job.attemptsMade + 1,
          "failed",
          error.message,
          duration,
        ]
      );

      // TEMP FAILED
      await pool.query(
        `UPDATE jobs 
         SET retry_count = retry_count + 1, status = $1 
         WHERE id = $2`,
        ["FAILED", jobId]
      );

      console.error(
        `Job ${jobId} failed (attempt ${job.attemptsMade + 1}):`,
        error.message
      );

      throw error; // let BullMQ retry
    }
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

//  FINAL FAILURE ONLY
worker.on("failed", async (job) => {
  try {
    //  CRITICAL FIX
    if (job.attemptsMade < job.opts.attempts) return;

    const jobId = job.data.dbJobId;

    console.log("Marking DEAD:", jobId);

    await pool.query(
      `UPDATE jobs SET status = $1 WHERE id = $2`,
      ["DEAD", jobId]
    );

  } catch (e) {
    console.error("Final failure update error:", e.message);
  }
});

console.log("🚀 Worker running...");