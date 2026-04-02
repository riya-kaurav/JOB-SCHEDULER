import dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import authRoutes from './api/routes/auth.routes.js';
import fastifyJwt from '@fastify/jwt';


const fastify = Fastify({ logger: true });


fastify.get('/health', async () => {
  return { status: 'ok' };
});

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
});

fastify.register(authRoutes, { prefix: '/api/v1/auth' });


fastify.get('/', async (request, reply) => {
  return { message: 'Hello world' };
});

export default fastify;
