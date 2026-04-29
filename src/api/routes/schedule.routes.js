import {
  createSchedule,
  listSchedules,
  updateSchedule
} from '../controllers/schedule.controller.js';

import authMiddleware from '../../middlewares/auth.middleware.js';

async function schedulesRoutes(fastify, _options) {
  
  // Create schedule
  fastify.post(
    '/api/v1/schedules',
    { preHandler: [authMiddleware] },
    createSchedule
  );

  // List schedules
  fastify.get(
    '/api/v1/schedules',
    { preHandler: [authMiddleware] },
    listSchedules
  );

  // Update schedule
  fastify.patch(
    '/api/v1/schedules/:id',
    { preHandler: [authMiddleware] },
    updateSchedule
  );
}

export default schedulesRoutes;