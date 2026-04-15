// import { z } from 'zod';
// import { enqueueJob } from '../../services/queue.service.js';

// //  Zod schema
// const createJobSchema = z.object({
//   name: z.string().min(1),
//   type: z.string().min(1),
//   payload: z.any().optional(),
//   priority: z.number().int().min(1).max(3).optional().default(2),
//   scheduled_at: z.string().datetime().optional()
// });

// export async function createJobHandler(request, reply) {
//   try {
//     //  Validate request body
//     const parsed = createJobSchema.parse(request.body);

//     const { name, type, payload, priority, scheduled_at } = parsed;

//     //  tenant from auth middleware
//     const tenantId = request.tenantId;

//     //  Insert into DB
//     const result = await request.server.db.query(
//       `
//       INSERT INTO jobs (name, type, payload, priority, scheduled_at, status, tenant_id)
//       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
//       RETURNING id, status, priority, scheduled_at, created_at
//       `,
//       [
//         name,
//         type,
//         payload ? JSON.stringify(payload) : null,
//         priority,
//         scheduled_at || null,
//         tenantId
//       ]
//     );

//     const job = result.rows[0];

//     //  Enqueue job
//     await enqueueJob({
//       id: job.id,
//       type,
//       payload,
//       priority,
//       scheduled_at
//     });

//     //  Response
//     return reply.code(201).send({
//       success: true,
//       data: job
//     });

//   } catch (error) {
//     //  Validation error
//     if (error instanceof z.ZodError) {
//       return reply.code(400).send({
//         success: false,
//         errors: error.errors
//       });
//     }

//     request.log.error(error);

//     return reply.code(500).send({
//       success: false,
//       message: 'Internal Server Error'
//     });
//   }
// }


// // GET /jobs (list + pagination)

// export const getJobsHandler = async (request, reply) => {
//   try {
//     const tenantId = request.tenantId;

//     const page = parseInt(request.query.page) || 1;
//     const limit = parseInt(request.query.limit) || 10;
//     const status = request.query.status;

//     const offset = (page - 1) * limit;

//     let query = `
//       SELECT *
//       FROM jobs
//       WHERE tenant_id = $1
//     `;

//     const values = [tenantId];

//     if (status) {
//       query += ` AND status = $2`;
//       values.push(status.toUpperCase());
//     }

//     query += `
//       ORDER BY created_at DESC
//       LIMIT $${values.length + 1}
//       OFFSET $${values.length + 2}
//     `;

//     values.push(limit, offset);

//     const { rows } = await request.server.db.query(query, values);

//     // total count
//     let countQuery = `SELECT COUNT(*) FROM jobs WHERE tenant_id = $1`;
//     const countValues = [tenantId];

//     if (status) {
//       countQuery += ` AND status = $2`;
//       countValues.push(status.toUpperCase());
//     }

//     const countResult = await request.server.db.query(
//       countQuery,
//       countValues
//     );

//     const total = parseInt(countResult.rows[0].count);

//     return reply.send({
//       data: rows,
//       total,
//       page,
//       limit,
//     });
//   } catch (err) {
//     request.log.error(err);
//     return reply.status(500).send({ message: "Internal Server Error" });
//   }
// };

// // GET /jobs/:id (detail + history)

// export const getJobByIdHandler = async (request, reply) => {
//   try {
//     const tenantId = request.tenantId;
//     const jobId = request.params.id;

//     // get job
//     const jobResult = await request.server.db.query(
//       `
//       SELECT *
//       FROM jobs
//       WHERE id = $1 AND tenant_id = $2
//       `,
//       [jobId, tenantId]
//     );

//     if (jobResult.rows.length === 0) {
//       return reply.status(404).send({ message: "Job not found" });
//     }

//     const job = jobResult.rows[0];

//     // get execution history
//     const execResult = await request.server.db.query(
//       `
//       SELECT attempt, status, error, duration_ms, executed_at
//       FROM job_executions
//       WHERE job_id = $1
//       ORDER BY executed_at DESC
//       `,
//       [jobId]
//     );

//     job.executions = execResult.rows;

//     return reply.send({ data: job });
//   } catch (err) {
//     request.log.error(err);
//     return reply.status(500).send({ message: "Internal Server Error" });
//   }
// };


// // DELETE /jobs/:id (cancel job)

// export const cancelJobHandler = async (request, reply) => {
//   try {
//     const tenantId = request.tenantId;
//     const jobId = request.params.id;

//     // check job
//     const result = await request.server.db.query(
//       `
//       SELECT status
//       FROM jobs
//       WHERE id = $1 AND tenant_id = $2
//       `,
//       [jobId, tenantId]
//     );

//     if (result.rows.length === 0) {
//       return reply.status(404).send({ message: "Job not found" });
//     }

//     const job = result.rows[0];

//     // only PENDING can be cancelled
//     if (job.status !== "PENDING") {
//       return reply.status(400).send({
//         message: `Cannot cancel job with status ${job.status}`,
//       });
//     }

//     // update status
//     await request.server.db.query(
//       `
//       UPDATE jobs
//       SET status = 'CANCELLED'
//       WHERE id = $1
//       `,
//       [jobId]
//     );

//     return reply.send({
//       message: "Job cancelled successfully",
//     });
//   } catch (err) {
//     request.log.error(err);
//     return reply.status(500).send({ message: "Internal Server Error" });
//   }
// };


import { z } from 'zod';
import { enqueueJob } from '../../services/queue.service.js';

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