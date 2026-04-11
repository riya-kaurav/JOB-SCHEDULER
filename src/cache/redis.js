import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

redis.on('error', (error) => {
  console.error('Redis error:', error);
});

// Health check (dev only)
// if (process.env.NODE_ENV !== 'production') {
//   redis.ping()
//     .then((pong) => console.log('Redis PING response:', pong))
//     .catch((err) => console.error('Redis PING failed:', err));
// }

export default redis;