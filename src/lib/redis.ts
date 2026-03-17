import Redis from 'ioredis';

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (redisInstance) {
    return redisInstance;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisInstance = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  redisInstance.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  return redisInstance;
}
