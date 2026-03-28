import {registerHandler} from '../controllers/auth.controller.js';

async function authRoutes(fastify , options) {
    fastify.post('/register' , registerHandler);
}

export default authRoutes;