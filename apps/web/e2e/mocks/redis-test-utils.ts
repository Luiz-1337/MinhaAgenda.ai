import { Redis } from "ioredis";

// Test Redis client
let testRedis: Redis | null = null;

// Test Redis database number (use separate DB for tests)
const TEST_REDIS_DB = 15;

/**
 * Gets the test Redis client
 */
export function getTestRedisClient(): Redis {
  if (testRedis) {
    return testRedis;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  
  testRedis = new Redis(redisUrl, {
    db: TEST_REDIS_DB,
    maxRetriesPerRequest: 3,
  });

  return testRedis;
}

/**
 * Setup test Redis instance
 * Clears all data in the test database
 */
export async function setupTestRedis(): Promise<void> {
  const redis = getTestRedisClient();
  
  // Clear all keys in the test database
  await redis.flushdb();
}

/**
 * Cleanup test Redis instance
 */
export async function cleanupTestRedis(): Promise<void> {
  if (testRedis) {
    await testRedis.flushdb();
    await testRedis.quit();
    testRedis = null;
  }
}

/**
 * Clear all rate limit keys
 */
export async function clearRateLimits(): Promise<void> {
  const redis = getTestRedisClient();
  const keys = await redis.keys("rate:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Clear all processed message keys
 */
export async function clearProcessedMessages(): Promise<void> {
  const redis = getTestRedisClient();
  const keys = await redis.keys("twilio:processed:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Clear all lock keys
 */
export async function clearLocks(): Promise<void> {
  const redis = getTestRedisClient();
  const keys = await redis.keys("lock:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Mark a message as processed (for testing idempotency)
 */
export async function markMessageAsProcessed(messageId: string): Promise<void> {
  const redis = getTestRedisClient();
  await redis.setex(`twilio:processed:${messageId}`, 3600, new Date().toISOString());
}

/**
 * Check if a message is processed
 */
export async function isMessageProcessed(messageId: string): Promise<boolean> {
  const redis = getTestRedisClient();
  const exists = await redis.exists(`twilio:processed:${messageId}`);
  return exists === 1;
}

/**
 * Set rate limit count for testing
 */
export async function setRateLimitCount(
  identifier: string,
  count: number,
  ttl = 60
): Promise<void> {
  const redis = getTestRedisClient();
  const key = `rate:phone:${identifier}`;
  await redis.setex(key, ttl, count.toString());
}

/**
 * Get rate limit count
 */
export async function getRateLimitCount(identifier: string): Promise<number> {
  const redis = getTestRedisClient();
  const key = `rate:phone:${identifier}`;
  const value = await redis.get(key);
  return value ? parseInt(value, 10) : 0;
}

/**
 * Acquire a lock (for testing)
 */
export async function acquireLock(
  resource: string,
  ttl = 30000
): Promise<string | null> {
  const redis = getTestRedisClient();
  const lockId = `test-${Date.now()}`;
  const key = `lock:${resource}`;

  const result = await redis.set(key, lockId, "PX", ttl, "NX");
  return result === "OK" ? lockId : null;
}

/**
 * Release a lock (for testing)
 */
export async function releaseLock(resource: string, lockId: string): Promise<void> {
  const redis = getTestRedisClient();
  const key = `lock:${resource}`;

  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  await redis.eval(script, 1, key, lockId);
}

/**
 * Clear all test data
 */
export async function clearAllTestData(): Promise<void> {
  await Promise.all([
    clearRateLimits(),
    clearProcessedMessages(),
    clearLocks(),
  ]);
}
