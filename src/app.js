import Fastify from 'fastify';
import authRoutes from './api/routes/auth.routes.js';


const fastify = Fastify({ logger: true });


fastify.get('/health', async () => {
  return { status: 'ok' };
});

fastify.register(authRoutes, { prefix: '/api/v1/auth' });


fastify.get('/', async (request, reply) => {
  return { message: 'Hello world' };
});

export default fastify;
