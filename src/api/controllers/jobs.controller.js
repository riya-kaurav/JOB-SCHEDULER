
import { z } from 'zod';
import { enqueueJob , jobQueue } from '../../services/queue.service.js';

const JOB_COLUMNS = `
  id,
  name,
  type,
  payload,
  priority,
  scheduled_at,
  status,
  created_at
`;

// Zod schema
const createJobSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  payload: z.any().optional(),
  priority: z.number().int().min(1).max(3).optional().default(2),
  scheduled_at: z.string().datetime().optional()
});

// CREATE JOB
export async function createJobHandler(request, reply) {
  try {
    const parsed = createJobSchema.parse(request.body);
    const { name, type, payload, priority, scheduled_at } = parsed;

    const tenantId = request.tenantId;

    const result = await request.server.db.query(
      `
      INSERT INTO jobs (name, type, payload, priority, scheduled_at, status, tenant_id)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
      RETURNING ${JOB_COLUMNS}
      `,
      [
        name,
        type,
        payload !== undefined ? payload : null,
        priority,
        scheduled_at ? new Date(scheduled_at) : null,
        tenantId
      ]
    );

    const job = result.rows[0];

    await enqueueJob({
      id: job.id,
      type,
      payload,
      priority,
      scheduled_at
    });

    return reply.code(201).send({
      success: true,
      data: job
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        success: false,
        errors: error.errors
      });
    }

    request.log.error(error);

    return reply.code(500).send({
      success: false,
      message: 'Internal Server Error'
    });
  }

  request.log.info(
  { tenantId: request.tenantId },
  "Creating job"
);
}

// GET JOBS (LIST)
export const getJobsHandler = async (request, reply) => {
  try {
    const tenantId = request.tenantId;

    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 10;
    const status = request.query.status;

    const offset = (page - 1) * limit;

    let query = `
      SELECT ${JOB_COLUMNS}
      FROM jobs
      WHERE tenant_id = $1
    `;

    const values = [tenantId];

    if (status) {
      query += ` AND status = $2`;
      values.push(status.toUpperCase());
    }

    query += `
      ORDER BY created_at DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;

    values.push(limit, offset);

    const { rows } = await request.server.db.query(query, values);

    // parse payload
    const jobs = rows;

    // count query
    let countQuery = `SELECT COUNT(*) FROM jobs WHERE tenant_id = $1`;
    const countValues = [tenantId];

    if (status) {
      countQuery += ` AND status = $2`;
      countValues.push(status.toUpperCase());
    }

    const countResult = await request.server.db.query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].count);

    return reply.send({
      success: true,
      data: jobs,
      meta: { total, page, limit }
    });

  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ message: "Internal Server Error" });
  }
};

// GET JOB BY ID
export const getJobByIdHandler = async (request, reply) => {
  try {
    const tenantId = request.tenantId;
    const jobId = request.params.id;

    const jobResult = await request.server.db.query(
      `
      SELECT ${JOB_COLUMNS}
      FROM jobs
      WHERE id = $1 AND tenant_id = $2
      `,
      [jobId, tenantId]
    );

    if (jobResult.rows.length === 0) {
      return reply.status(404).send({ message: "Job not found" });
    }

    const job = jobResult.rows[0];

    

    // execution history
    const execResult = await request.server.db.query(
      `
      SELECT attempt, status, error, duration_ms, executed_at
      FROM job_executions
      WHERE job_id = $1
      ORDER BY executed_at DESC
      `,
      [jobId]
    );

    job.executions = execResult.rows;

    return reply.send({
      success: true,
      data: job
    });

  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ message: "Internal Server Error" });
  }
};

// CANCEL JOB (SINGLE QUERY )
export const cancelJobHandler = async (request, reply) => {
  try {
    const tenantId = request.tenantId;
    const jobId = request.params.id;

    const result = await request.server.db.query(
      `
      UPDATE jobs
      SET status = 'CANCELLED'
      WHERE id = $1
        AND tenant_id = $2
        AND status = 'PENDING'
      RETURNING ${JOB_COLUMNS}
      `,
      [jobId, tenantId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        message: "Job not found or not cancellable"
      });
    }

    return reply.send({
      success: true,
      message: "Job cancelled successfully",
      data: result.rows[0]
    });

  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ message: "Internal Server Error" });
  }
};

export async function getDeadLetterJobsHandler(request, reply) {
  try {
    const { tenantId, role } = request;

    if (role !== 'ADMIN') {
      return reply.code(403).send({
        success: false,
        message: 'Admin access required'
      });
    }

    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 10;
    const offset = (page - 1) * limit;

    const result = await request.server.db.query(
      `SELECT ${JOB_COLUMNS}
       FROM jobs
       WHERE tenant_id = $1 AND status = 'DEAD'
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    const countResult = await request.server.db.query(
      `SELECT COUNT(*) FROM jobs
       WHERE tenant_id = $1 AND status = 'DEAD'`,
      [tenantId]
    );

    const total = parseInt(countResult.rows[0].count);

    return reply.send({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({
      success: false,
      message: 'Internal Server Error'
    });
  }
}

export async function retryJobHandler(request, reply) {
  try {
    const { id } = request.params;
    const { tenantId } = request;

    // 1. Fetch job
    const result = await request.server.db.query(
      `SELECT ${JOB_COLUMNS}, tenant_id
       FROM jobs
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    const job = result.rows[0];

    if (!job) {
      return reply.code(404).send({
        success: false,
        message: "Job not found"
      });
    }

    // 2. Only DEAD jobs
    if (job.status !== 'DEAD') {
      return reply.code(400).send({
        success: false,
        message: "Only DEAD jobs can be retried"
      });
    }


    // 3. Reset DB
    await request.server.db.query(
      `UPDATE jobs
       SET status = 'PENDING',
           retry_count = 0
       WHERE id = $1`,
      [id]
    );

    //  4. REMOVE EXISTING BULLMQ JOB (CRITICAL FIX)
    const existingJob = await jobQueue.getJob(job.id);
    if (existingJob) {
      await existingJob.remove();
    }

    // 5. Re-enqueue
    await enqueueJob({
      id: job.id,
      type: job.type,
      payload: job.payload,
      priority: job.priority,
      scheduled_at: job.scheduled_at,
      tenant_id: job.tenant_id
    });

    // 6. Return updated job
    const updated = await request.server.db.query(
      `SELECT ${JOB_COLUMNS}
       FROM jobs
       WHERE id = $1`,
      [id]
    );

    return reply.send({
      success: true,
      data: updated.rows[0]
    });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({
      success: false,
      message: "Internal Server Error"
    });
  }
}