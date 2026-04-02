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
      // console.log('DEBUG password:', password, typeof password);

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
      `INSERT INTO users (email, password_hash, tenant_id, role)
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
    client.release(); 
  }
}

// login handler
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function loginHandler(request , reply) {
  
  try {
    const { email , password} = loginSchema.parse(request .body);
    const userRes = await pool.query(
      `SELECT id, email, password_hash, tenant_id, role
       FROM users
       WHERE email = $1`,
      [email]
    );

    if(userRes.rows.length === 0) {
      return reply.status(401).send({
        error: 'Invalid email or password',
      });
    }

    const user = userRes.rows[0];

    // compare password
    const isMatch = await bcrypt.compare(password , user.password_hash);

    if(!isMatch) {
      return reply.status(401).send({
        error: 'Invalid email or password',
      });
    }

    // generate JWT
    const payload = {
      userId: user.id ,
      // email : user.email, best practice to not include email in token payload
      tenantId : user.tenant_id,
      role : user.role,
    };

    const accessToken = request.server.jwt.sign(payload, {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    });

    const refreshToken = request.server.jwt.sign(payload, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });

    return reply.status(200).send({
      accessToken,
      refreshToken,
    });
  }
    catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: err.errors
        });
      }

      console.error(err);

      return reply.status(400).send({
        error: err.message,
      });
    }
    
}