import {registerHandler} from '../controllers/auth.controller.js';
import { loginHandler} from '../controllers/auth.controller.js';
import { createApiKey} from '../controllers/auth.controller.js';

async function authRoutes(fastify , options) {
    fastify.post('/register' , registerHandler);
    fastify.post('/login' , loginHandler);
    fastify.post('/api-keys',
        { preHandler: fastify.authMiddleware},
        createApiKey
    );

}

export default authRoutes;