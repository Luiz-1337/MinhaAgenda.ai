import Redis from 'ioredis';
import 'dotenv/config';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const keys = await redis.keys('lock:*');
console.log('Found locks:', keys);

if (keys.length > 0) {
    const deleted = await redis.del(...keys);
    console.log('Deleted', deleted, 'locks');
} else {
    console.log('No locks to delete');
}

await redis.quit();
console.log('Done');
