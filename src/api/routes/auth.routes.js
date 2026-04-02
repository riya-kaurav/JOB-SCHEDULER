import {registerHandler} from '../controllers/auth.controller.js';
import { loginHandler} from '../controllers/auth.controller.js';
import { createApiKey} from '../controllers/auth.controller.js';
import { logoutHandler} from '../controllers/auth.controller.js';
import { refreshHandler} from '../controllers/auth.controller.js';

async function authRoutes(fastify , options) {
    fastify.post('/register' , registerHandler);
    fastify.post('/login' , loginHandler);
    fastify.post('/api-keys',
        { preHandler: fastify.authMiddleware},
        createApiKey
    );
    fastify.post(
  '/logout',
  { preHandler: fastify.authMiddleware },
  logoutHandler
);

fastify.post('/refresh', refreshHandler);
}

export default authRoutes;