import { z } from 'zod';
import bcrypt from 'bcrypt';
import pool  from '../../db/index.js';



const registerSchema = z.object({
  tenantName: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function registerHandler(request, reply) {
  const client = await pool.connect();

  try {
    //  Validate input
    const { tenantName, email, password } =
      registerSchema.parse(request.body);

    //  Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    //  Start transaction
    await client.query('BEGIN');

    //  Insert tenant
    const tenantRes = await client.query(
      `INSERT INTO tenants (name)
       VALUES ($1)
       RETURNING id, name`,
      [tenantName]
    );

    const tenant = tenantRes.rows[0];

    //  Insert admin user
    const userRes = await client.query(
      `INSERT INTO users (email, password, tenant_id, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, tenant_id, role`,
      [email, hashedPassword, tenant.id, 'ADMIN']
    );

    const user = userRes.rows[0];

    //  Commit
    await client.query('COMMIT');

    return reply.status(201).send({
      tenant,
      user,
    });

  } catch (err) {
    //  Rollback
    await client.query('ROLLBACK');

    if (err instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: err.errors
      });
    }

    console.error(err);

    // Unique email error
    if (err.code === '23505') {
      return reply.status(409).send({
        error: 'Email already exists',
      });
    }

    return reply.status(400).send({
      error: err.message,
    });

  } finally {
    client.release(); //  MUST
  }
}