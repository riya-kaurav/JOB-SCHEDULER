import dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import authMiddleware from './middlewares/auth.middleware.js';
import authRoutes from './api/routes/auth.routes.js';
import fastifyJwt from '@fastify/jwt';
import logger from './utils/logger.js';
import crypto from 'crypto';
import  redis from './cache/redis.js';
import jobsRoutes from './api/routes/jobs.routes.js';
import pool from './db/index.js'
import schedulesRoutes from './api/routes/schedule.routes.js';
import jobQueue from './services/queue.service.js';


const fastify = Fastify({ 
  loggerInstance: logger,  
  genReqId: () => crypto.randomUUID()
 });

fastify.decorate('redis', redis)
fastify.decorate('db', pool)

// Health check end point with detailed service status
fastify.get('/health', async (request, reply) => {
  const services = {
    database: { status: 'ok' },
    redis: { status: 'ok' }
  };

  // Run checks in parallel for efficiency
  await Promise.all([
    (async () => {
      try {
        await pool.query('SELECT 1');
      } catch (err) {
        services.database = {
          status: 'error',
          message: err.message
        };
      }
    })(),

    (async () => {
      try {
        await redis.ping();
      } catch (err) {
        services.redis = {
          status: 'error',
          message: err.message
        };
      }
    })()
  ]);

  const isHealthy =
    services.database.status === 'ok' &&
    services.redis.status === 'ok';

  const response = {
    status: isHealthy ? 'ok' : 'error',
    services
  };

  if (!isHealthy) {
    return reply.code(503).send(response);
  }

  return reply.code(200).send(response);
});

// Metrics endpoint for monitoring
fastify.get('/metrics', async (request, reply) => {
  try {
    const [dbResult, queueCounts] = await Promise.all([
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM jobs
        GROUP BY status
      `),
      jobQueue.getJobCounts('waiting', 'active', 'delayed')
    ]);

    // Default structure
    const byStatus = {
      PENDING: 0,
      COMPLETED: 0,
      FAILED: 0,
      DEAD: 0
    };

    for (const row of dbResult.rows) {
      const status = row.status;
      const count = Number(row.count);

      byStatus[status] = count; // allow overwrite or new status
    }

    const response = {
      jobs: {
        by_status: byStatus
      },
      queue: {
        waiting: queueCounts.waiting || 0,
        active: queueCounts.active || 0,
        delayed: queueCounts.delayed || 0
      }
    };

    return reply
      .type('application/json')
      .code(200)
      .send(response);

  } catch (err) {
    request.log.error({ err }, 'Metrics endpoint failed');

    return reply.code(500).send({
      status: 'error',
      message: 'Failed to fetch metrics'
    });
  }
});


fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
});



fastify.register(authRoutes, { prefix: '/api/v1/auth' });
fastify.register(jobsRoutes, { prefix: '/api/v1' });
fastify.register(schedulesRoutes);


fastify.get('/', async (request, reply) => {
  return { message: 'Hello world' };
});

export default fastify;
