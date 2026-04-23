import crypto from 'crypto'
import { query } from '../db/index.js' // adjust path if needed

async function authMiddleware(request, reply) {
   
  try {
    // 1. Check API key first
    const apiKey = request.headers['x-api-key']

    if (apiKey) {
      // Hash API key using SHA-256
      const hashedKey = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex')

      // Find matching key in DB
      const result = await query(
        `SELECT id, tenant_id FROM api_keys WHERE key_hash = $1`,
        [hashedKey]
      )

      const keyRecord = result.rows[0]

      if (!keyRecord) {
        request.log.warn('Invalid API key attempt');
        return reply.code(401).send({ error: 'Invalid API key' })
      }

      // Update last_used timestamp
      await query(
        `UPDATE api_keys SET last_used = NOW() WHERE id = $1`,
        [keyRecord.id]
      )

      // Attach tenantId to request
      request.tenantId = keyRecord.tenant_id
      // logger
      request.log = request.log.child({
        tenantId: request.tenantId,
        authType: 'apiKey'
      });
    request.log.info(
  {
    tenantId: request.tenantId,
    authType: request.role ? 'jwt' : 'apiKey'
  },
  "AUTH SUCCESS"
);
      return;
    }

    // 2. Check JWT
    const authHeader = request.headers['authorization']

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        // await request.jwtVerify()

        //    const { userId, tenantId, role } = request.user

        //      request.userId =userId
        //      request.tenantId = tenantId
        //      request.role = role
        const decoded = await request.jwtVerify();

        request.userId = decoded.userId;
        request.tenantId = decoded.tenantId;
        request.role = decoded.role;

        //  enrich logger AFTER decode
        request.log = request.log.child({
          tenantId: request.tenantId,
          userId: request.userId,
          authType: 'jwt'
        });

               return;

      } catch (err) {
        request.log.warn({ err }, 'JWT verification failed');
        return reply.code(401).send({ error: 'Invalid or expired token' })
      }
    }

    // 3. No auth provided
    request.log.warn('No authentication provided');
    return reply.code(401).send({ error: 'Unauthorized' })

  } catch (err) {
    request.log.error({ err }, 'Auth middleware error');
  return reply.code(500).send({ error: 'Internal server error' });
  }
  request.log.info(
  { tenantId: request.tenantId },
  "Auth successful"
);
}

export default authMiddleware