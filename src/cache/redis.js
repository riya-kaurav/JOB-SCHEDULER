import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

redis.on('error' , (error) => {
    console.error('Redis error:', error);
});

// Temporary health check
redis.ping()
  .then((pong) => console.log('Redis PING response:', pong))
  .catch((err) => console.error('Redis PING failed:', err));



export default redis;