import { createJobHandler } from '../controllers/jobs.controller.js';

async function jobsRoutes(fastify, options) {
  fastify.post(
    '/jobs',
    { preHandler: fastify.authMiddleware },
    createJobHandler
  );
}

export default jobsRoutes;