import { createJobHandler,
  getJobsHandler,
  getJobByIdHandler,
  cancelJobHandler,
  getDeadLetterJobsHandler,
  retryJobHandler
 } from '../controllers/jobs.controller.js';
 import authMiddleware from '../../middlewares/auth.middleware.js';
 import { rateLimitMiddleware } from '../../middlewares/rateLimit.middleware.js';

async function jobsRoutes(fastify, _options) {
  fastify.post(
    '/jobs',
    { preHandler: [authMiddleware, rateLimitMiddleware] },
    createJobHandler
  );

  // List jobs
  fastify.get(
    "/jobs",
    { preHandler: authMiddleware },
    getJobsHandler
  );

  // Dead letter jobs
  fastify.get(
    "/jobs/dead-letter",
    { preHandler: authMiddleware},
    getDeadLetterJobsHandler
  );


  // Job detail
  fastify.get(
    "/jobs/:id",
    { preHandler: authMiddleware },
    getJobByIdHandler
  );
   
  // Retry job

  fastify.post(
    "/jobs/:id/retry",
    { preHandler: authMiddleware },
    retryJobHandler
  );
  
  // Cancel job
  fastify.delete(
    "/jobs/:id",
    { preHandler: authMiddleware },
    cancelJobHandler
  );

}

export default jobsRoutes;