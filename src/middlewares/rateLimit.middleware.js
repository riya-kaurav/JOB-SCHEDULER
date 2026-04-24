import redis from '../cache/redis.js';
import pool from '../db/index.js';

export async function rateLimitMiddleware(request, reply) {
   request.log.warn("Rate limit hit");
  try {
    const tenantId = request.tenantId;

    if (!tenantId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    //  Build date string for daily tracking
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD

    //  Redis keys
    const rateKey = `ratelimit:${tenantId}:${date}`;
    const limitKey = `tenant:limit:${tenantId}`;

    //  Atomic increment
    const count = await redis.incr(rateKey);

    //  Set expiry only on first request
    if (count === 1) {
      await redis.expire(rateKey, 86400); // 24 hours
    }

    //  Get daily_limit (Redis → DB fallback)
    let dailyLimit = await redis.get(limitKey);

    if (!dailyLimit) {
      const result = await pool.query(
        'SELECT daily_limit FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }

      dailyLimit = result.rows[0].daily_limit;

      // cache for 5 minutes
      await redis.set(limitKey, dailyLimit, 'EX', 300);
    } else {
      dailyLimit = Number(dailyLimit);
    }

    //  Check limit
    if (count > dailyLimit) {
      return reply.code(429).send({
        error: 'Daily job limit exceeded',
        limit: dailyLimit,
        used: count,
        reset: 'midnight UTC'
      });
    }

    //  Within limit → continue
    return;

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
}