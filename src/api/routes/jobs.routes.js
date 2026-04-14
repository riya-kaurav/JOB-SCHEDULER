import { createJobHandler,
  getJobsHandler,
  getJobByIdHandler,
  cancelJobHandler,
 } from '../controllers/jobs.controller.js';

async function jobsRoutes(fastify, options) {
  fastify.post(
    '/jobs',
    { preHandler: fastify.authMiddleware },
    createJobHandler
  );

  // List jobs
  fastify.get(
    "/jobs",
    { preHandler: fastify.authMiddleware },
    getJobsHandler
  );

  // Job detail
  fastify.get(
    "/jobs/:id",
    { preHandler: fastify.authMiddleware },
    getJobByIdHandler
  );

  // Cancel job
  fastify.delete(
    "/jobs/:id",
    { preHandler: fastify.authMiddleware },
    cancelJobHandler
  );

}

export default jobsRoutes;