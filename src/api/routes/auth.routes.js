import {registerHandler} from '../controllers/auth.controller.js';
import { loginHandler} from '../controllers/auth.controller.js';

async function authRoutes(fastify , options) {
    fastify.post('/register' , registerHandler);
    fastify.post('/login' , loginHandler);
}

export default authRoutes;