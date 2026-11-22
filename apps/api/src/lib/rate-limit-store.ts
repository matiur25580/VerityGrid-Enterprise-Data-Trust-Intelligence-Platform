import Redis from "ioredis";
import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  lazyConnect: true,
  connectTimeout: 1_000,
  maxRetriesPerRequest: 1,
});

redis.on("error", (error) => {
  console.error("Rate-limit Redis connection error.", {
    errorCode: error instanceof Error ? error.name : "UNKNOWN",
  });
});

const incrementScript = [
  "local hits = redis.call('INCR', KEYS[1])",
  "if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end",
  "return { hits, ttl }",
].join("\n");

/** A Redis-backed express-rate-limit store shared by every API replica. */
export class RedisRateLimitStore implements Store {
  private windowMs = 15 * 60 * 1000;

  constructor(private readonly namespace: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redisKey = `veritygrid:rate-limit:${this.namespace}:${key}`;
    const result = (await redis.eval(incrementScript, 1, redisKey, String(this.windowMs))) as [number, number];
    const totalHits = Number(result[0]);
    const ttl = Math.max(0, Number(result[1]));
    return { totalHits, resetTime: new Date(Date.now() + ttl) };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `veritygrid:rate-limit:${this.namespace}:${key}`;
    await redis.eval(
      "local value = redis.call('DECR', KEYS[1]); if value < 0 then redis.call('SET', KEYS[1], 0, 'PX', ARGV[1]) end; return 1",
      1,
      redisKey,
      String(this.windowMs),
    );
  }

  async resetKey(key: string): Promise<void> {
    await redis.del(`veritygrid:rate-limit:${this.namespace}:${key}`);
  }
}

export async function closeRateLimitRedis(): Promise<void> {
  if (redis.status === "ready") {
    await redis.quit();
  } else {
    redis.disconnect();
  }
}
