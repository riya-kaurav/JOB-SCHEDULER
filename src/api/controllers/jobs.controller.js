import { z } from 'zod';
import { enqueueJob } from '../../services/queue.service.js';

//  Zod schema
const createJobSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  payload: z.any().optional(),
  priority: z.number().int().min(1).max(3).optional().default(2),
  scheduled_at: z.string().datetime().optional()
});

export async function createJobHandler(request, reply) {
  try {
    //  Validate request body
    const parsed = createJobSchema.parse(request.body);

    const { name, type, payload, priority, scheduled_at } = parsed;

    //  tenant from auth middleware
    const tenantId = request.tenantId;

    //  Insert into DB
    const result = await request.server.db.query(
      `
      INSERT INTO jobs (name, type, payload, priority, scheduled_at, status, tenant_id)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      RETURNING id, status, priority, scheduled_at, created_at
      `,
      [
        name,
        type,
        payload ? JSON.stringify(payload) : null,
        priority,
        scheduled_at || null,
        tenantId
      ]
    );

    const job = result.rows[0];

    //  Enqueue job
    await enqueueJob({
      id: job.id,
      type,
      payload,
      priority,
      scheduled_at
    });

    //  Response
    return reply.code(201).send({
      success: true,
      data: job
    });

  } catch (error) {
    //  Validation error
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