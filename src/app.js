import Fastify from 'fastify';


const fastify = Fastify({ logger: true });


fastify.get('/health', async () => {
  return { status: 'ok' };
});

fastify.get('/', async (request, reply) => {
  return { message: 'Hello world' };
});

export default fastify;
