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


const fastify = Fastify({ 
  loggerInstance: logger,  
  genReqId: () => crypto.randomUUID()
 });

fastify.decorate('redis', redis)
fastify.decorate('db', pool)
fastify.get('/health', async () => {
  return { status: 'ok' };
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
