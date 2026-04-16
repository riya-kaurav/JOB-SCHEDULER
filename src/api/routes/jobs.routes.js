import { createJobHandler,
  getJobsHandler,
  getJobByIdHandler,
  cancelJobHandler,
  getDeadLetterJobsHandler,
  retryJobHandler
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

  // Dead letter jobs
  fastify.get(
    "/jobs/dead-letter",
    { preHandler: fastify.authMiddleware},
    getDeadLetterJobsHandler
  );


  // Job detail
  fastify.get(
    "/jobs/:id",
    { preHandler: fastify.authMiddleware },
    getJobByIdHandler
  );
   
  // Retry job

  fastify.post(
    "/jobs/:id/retry",
    { preHandler: fastify.authMiddleware },
    retryJobHandler
  );
  
  // Cancel job
  fastify.delete(
    "/jobs/:id",
    { preHandler: fastify.authMiddleware },
    cancelJobHandler
  );

}

export default jobsRoutes;