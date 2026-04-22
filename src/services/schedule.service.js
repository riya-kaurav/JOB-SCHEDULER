import parser from 'cron-parser';

/**
 * Compute next run time from cron expression
 */
export function getNextRunTime(cronExpr, currentDate = new Date()) {
  const interval = parser.parseExpression(cronExpr, {
    currentDate
  });

  return interval.next().toDate(); // MUST return Date
}

/**
 * Load and lock due schedules
 */
export async function loadDueSchedulesForProcessing(client) {
  const { rows } = await client.query(`
    SELECT *
    FROM job_schedules
    WHERE is_active = true
      AND next_run <= NOW()
    FOR UPDATE SKIP LOCKED
  `);

  return rows;
}

/**
 * Create job record (DB ONLY — no queue here)
 */
export async function createJobRecord(client, schedule) {
  const { rows } = await client.query(
    `
    INSERT INTO jobs (
      tenant_id,
      name,
      type,
      payload,
      status,
      priority,
      scheduled_at
    )
    VALUES ($1, $2, $3, $4, 'PENDING', 2, $5)
    RETURNING *
    `,
    [
      schedule.tenant_id,
      schedule.job_type,
      schedule.job_type,
      schedule.payload,
      schedule.next_run // already a Date
    ]
  );

  return rows[0];
}

/**
 * Update schedule after execution
 */
export async function updateScheduleAfterRun(client, schedule) {
  let nextRun;

  try {
    const interval = parser.parseExpression(schedule.cron_expr, {
      currentDate: schedule.next_run
    });

    nextRun = interval.next().toDate();
  } catch (err) {
    // deactivate invalid cron safely inside same txn
    await client.query(
      `
      UPDATE job_schedules
      SET is_active = false
      WHERE id = $1
      `,
      [schedule.id]
    );

    throw new Error(`Invalid cron for schedule ${schedule.id}`);
  }

  await client.query(
    `
    UPDATE job_schedules
    SET last_run = $1,
        next_run = $2
    WHERE id = $3
    `,
    [schedule.next_run, nextRun, schedule.id]
  );

  return nextRun;
}