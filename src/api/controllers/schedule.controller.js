import { z } from "zod";
import { getNextRunTime } from "../../services/schedule.service.js";

/**
 * CREATE SCHEDULE
 */
const createScheduleSchema = z.object({
  job_type: z.string().min(1),
  payload: z.any().optional(),
  cron_expr: z.string().min(1) // ✅ fixed name
});

export async function createSchedule(request, reply) {
  try {
    // 1. Validate input
    const parsed = createScheduleSchema.parse(request.body);
    const { job_type, payload, cron_expr } = parsed;

    // 2. Correct tenant extraction
    const tenantId = request.tenantId;

    if (!tenantId) {
      return reply.code(401).send({
        success: false,
        message: "Unauthorized"
      });
    }

    // 3. Validate cron + compute next run
    let nextRun;
    try {
      nextRun = getNextRunTime(cron_expr);
    } catch (_err) {
      return reply.code(400).send({
        success: false,
        message: "Invalid cron expression"
      });
    }

    // 4. Insert into DB (fixed column name)
    const result = await request.server.db.query(
      `
      INSERT INTO job_schedules (
        tenant_id,
        job_type,
        payload,
        cron_expr,
        next_run
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [tenantId, job_type, payload ?? null, cron_expr, nextRun]
    );

    return reply.code(201).send({
      success: true,
      data: result.rows[0]
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
      message: "Internal Server Error"
    });
  }
}

/**
 * LIST SCHEDULES
 */
export async function listSchedules(request, reply) {
  try {
    const tenantId = request.tenantId;

    if (!tenantId) {
      return reply.code(401).send({
        success: false,
        message: "Unauthorized"
      });
    }

    const result = await request.server.db.query(
      `
      SELECT *
      FROM job_schedules
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      `,
      [tenantId]
    );

    return reply.send({
      success: true, // ✅ fixed typo
      data: result.rows
    });

  } catch (error) {
    request.log.error(error);

    return reply.code(500).send({
      success: false,
      message: "Internal Server Error"
    });
  }
}

/**
 * UPDATE SCHEDULE
 */
const updateScheduleSchema = z.object({
  job_type: z.string().min(1).optional(),
  payload: z.any().optional(),
  cron_expr: z.string().min(1).optional(),
  is_active: z.boolean().optional()
});

export async function updateSchedule(request, reply) {
  try {
    const tenantId = request.tenantId;
    const scheduleId = request.params.id;

    const parsed = updateScheduleSchema.parse(request.body);
    const { job_type, payload, cron_expr, is_active } = parsed;

    // Fetch existing
    const existingResult = await request.server.db.query(
      `
      SELECT *
      FROM job_schedules
      WHERE id = $1 AND tenant_id = $2
      `,
      [scheduleId, tenantId]
    );

    if (existingResult.rows.length === 0) {
      return reply.code(404).send({
        success: false,
        message: "Schedule not found"
      });
    }

    const existing = existingResult.rows[0];

    // Handle cron update
    let nextRun = existing.next_run;

    if (cron_expr !== undefined) {
      try {
        nextRun = getNextRunTime(cron_expr);
      } catch (_err) {
        return reply.code(400).send({
          success: false,
          message: "Invalid cron expression"
        });
      }
    }

    // Update
    const result = await request.server.db.query(
      `
      UPDATE job_schedules
      SET job_type = COALESCE($1, job_type),
          payload = COALESCE($2, payload),
          cron_expr = COALESCE($3, cron_expr),
          is_active = COALESCE($4, is_active),
          next_run = $5
      WHERE id = $6 AND tenant_id = $7
      RETURNING *
      `,
      [
        job_type ?? null,
        payload ?? null,
        cron_expr ?? null,
        is_active ?? null,
        nextRun,
        scheduleId,
        tenantId
      ]
    );

    return reply.send({
      success: true,
      data: result.rows[0]
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
      message: "Internal Server Error"
    });
  }
}