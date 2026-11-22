import { rateLimit } from "express-rate-limit";
import IORedis from "ioredis";
import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;
const PREFIX = "veritygrid:ratelimit:api:";

// Keep counter creation and expiry assignment atomic across API instances.
const INCREMENT_SCRIPT = `
local hits = redis.call("INCR", KEYS[1])
if hits == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { hits, ttl }
`;

class RedisRateLimitStore implements Store {
  private readonly client: IORedis;

  constructor() {
    this.client = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      enableReadyCheck: true,
    });
  }

  init(_options: Options): void {}

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const result = await this.client.eval(INCREMENT_SCRIPT, 1, PREFIX + key, String(WINDOW_MS)) as [number, number];
    const totalHits = Number(result[0]);
    const ttl = Number(result[1]);
    return { totalHits, resetTime: new Date(Date.now() + Math.max(0, ttl)) };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = PREFIX + key;
    const current = await this.client.get(redisKey);
    if (current !== null && Number(current) > 0) await this.client.decr(redisKey);
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(PREFIX + key);
  }

  async shutdown(): Promise<void> {
    if (this.client.status !== "end") await this.client.quit();
  }
}

const apiRateLimitStore = new RedisRateLimitStore();

export function createApiRateLimiter(limit = 300) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    store: apiRateLimitStore,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: {
        code: "API_RATE_LIMITED",
        message: "Too many requests. Please slow down and try again later.",
      },
    },
  });
}

export async function closeApiRateLimitStore() {
  await apiRateLimitStore.shutdown();
}
