import { Worker } from "bullmq";
import redis from "../cache/redis.js"; //  use your existing redis
import pool from "../db/index.js";

import { emailHandler } from "./handlers/email.handler.js";
import { reportHandler } from "./handlers/report.handler.js";

// Map job types → handlers
const handlers = {
  email: emailHandler,
  report: reportHandler,
};

const worker = new Worker(
  "jobs",
  async (job) => {
    const handler = handlers[job.name];

    if (!handler) {
      throw new Error(`No handler for job type: ${job.name}`);
    }

    const jobId = job.data.dbJobId;
    const startTime = Date.now();

    try {
      //  Mark as RUNNING
      await pool.query(
        `UPDATE jobs SET status = $1 WHERE id = $2`,
        ["RUNNING", jobId]
      );

      //  Execute handler
      await handler(job);

      const duration = Date.now() - startTime;

      //  Log success
      await pool.query(
        `INSERT INTO job_executions 
        (job_id, attempt, status, duration_ms) 
        VALUES ($1, $2, $3, $4)`,
        [jobId, job.attemptsMade + 1, "success", duration]
      );

      //  Mark COMPLETED
      await pool.query(
        `UPDATE jobs 
         SET status = $1, completed_at = NOW() 
         WHERE id = $2`,
        ["COMPLETED", jobId]
      );

    } catch (error) {
      const duration = Date.now() - startTime;

      //  Log failure
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

      //  Update retry count
      await pool.query(
        `UPDATE jobs 
         SET retry_count = retry_count + 1, status = $1 
         WHERE id = $2`,
        ["FAILED", jobId]
      );

      console.error("Job failed:", error.message);

      //  Let BullMQ retry
      throw error;
    }
  },
  {
    connection: redis, //  using your redis
    concurrency: 5,
  }
);

//  When retries exhausted
worker.on("failed", async (job) => {
  try {
    const jobId = job.data.jobId;

    if (job.attemptsMade >= job.opts.attempts) {
      await pool.query(
        `UPDATE jobs SET status = $1 WHERE id = $2`,
        ["FAILED", jobId]
      );

      console.error(
        `Job ${jobId} permanently failed after ${job.attemptsMade} attempts`
      );
    }
  } catch (err) {
    console.error("Final failure update error:", err.message);
  }
});

console.log(" Worker running...");