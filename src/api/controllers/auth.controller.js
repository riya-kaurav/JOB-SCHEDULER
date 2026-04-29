import { z } from 'zod';
import bcrypt from 'bcrypt';
import pool  from '../../db/index.js';
import crypto from 'crypto';
import { error } from 'console';

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

    

    // Unique email error
    if (error.code === '23505') {
      return reply.status(409).send({
        error: 'Email already exists',
      });
    }

    console.error(error);

    return reply.status(400).send({
      error: error.message,
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
    catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: error.errors
        });
      }

      console.error(error);

      return reply.status(400).send({
        error: error.message,
      });
    }
    
}
export async function createApiKey(request, reply) {
  
  try {
    // 1. Ensure JWT-only access
    if (!request.userId) {
      return reply.code(401).send({
        error: 'This endpoint requires JWT authentication'
      });
    }

    // 2. Generate raw API key
    const rawKey = crypto.randomBytes(32).toString('hex');

    // 3. Hash the key
    const keyHash = crypto
      .createHash('sha256')
      .update(rawKey)
      .digest('hex');

    // 4. Get tenant + optional name
    const tenantId = request.tenantId;
    const { name } = request.body || {};

    // 5. Store in DB
    const result = await pool.query(
      `INSERT INTO api_keys (tenant_id, key_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, name`,
      [tenantId, keyHash, name || null]
    );

    const apiKey = result.rows[0];

    // 6. Return raw key ONCE
    return reply.status(201).send({
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      warning: 'Store this key securely. It will not be shown again.'
    });

  } catch (error) {
    console.error(error);

    return reply.status(500).send({
      error: 'Failed to create API key'
    });
  }
}

export async function logoutHandler(request, reply) {
  const { refreshToken } = request.body;

  if (!refreshToken) {
    return reply.code(400).send({
      error: 'Refresh token required'
    });
  }

  try {
    //  1. Verify token (IMPORTANT)
    const decoded = request.server.jwt.verify(refreshToken);

    //  2. Calculate TTL
    const exp = decoded.exp;
    const now = Math.floor(Date.now() / 1000);
    const ttl = exp - now;

    if (ttl <= 0) {
      return reply.code(400).send({
        error: 'Token already expired'
      });
    }

    // 3. Store in Redis blacklist
    const key = `blacklist:${refreshToken}`;

    await request.server.redis.set(key, 'true', 'EX', ttl);

    //  4. Success response
    return reply.code(200).send({
      message: 'Logged out successfully'
    });

  } catch (_error) {
    return reply.code(401).send({
      error: 'Invalid or expired refresh token'
    });
  }
}

export async function refreshHandler(request, reply) {
  const { refreshToken } = request.body;

  if (!refreshToken) {
    return reply.code(400).send({
      error: 'Refresh token required'
    });
  }

  try {
    //  1. Check if token is blacklisted
    const isBlacklisted = await request.server.redis.get(
      `blacklist:${refreshToken}`
    );

    if (isBlacklisted) {
      return reply.code(401).send({
        error: 'Token is blacklisted'
      });
    }

    //  2. Verify token
    const decoded = request.server.jwt.verify(refreshToken);

    const { userId, tenantId, role, exp } = decoded;

    // 3. Calculate TTL for old token
    const now = Math.floor(Date.now() / 1000);
    const ttl = exp - now;

    if (ttl > 0) {
      //  4. Blacklist old refresh token
      await request.server.redis.set(
        `blacklist:${refreshToken}`,
        'true',
        'EX',
        ttl
      );
    }

    //  5. Generate new tokens
    const payload = { userId, tenantId, role };

    const newAccessToken = request.server.jwt.sign(payload, {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    });

    const newRefreshToken = request.server.jwt.sign(payload, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });

    //  6. Return new tokens
    return reply.send({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (_error) {
    return reply.code(401).send({
      error: 'Invalid or expired refresh token'
    });
  }
}