
import fastify from './app.js';
import authMiddleware from './middlewares/auth.middleware.js';

const PORT = process.env.PORT || 3000;
fastify.decorate('authMiddleware', authMiddleware);

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Server running on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
