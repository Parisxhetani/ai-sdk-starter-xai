import { LRUCache } from "lru-cache"

interface RateLimitOptions {
  intervalMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

// In-memory rate limit store (per IP/user)
const ipStore = new LRUCache<string, { count: number; resetAt: number }>({
  max: 10000,
  ttl: 5 * 60 * 1000, // 5 minutes
})

const userStore = new LRUCache<string, { count: number; resetAt: number }>({
  max: 10000,
  ttl: 5 * 60 * 1000,
})

export function createRateLimiter(options: RateLimitOptions) {
  const { intervalMs, maxRequests } = options

  return function rateLimit(identifier: string): RateLimitResult {
    const now = Date.now()
    const store = identifier.startsWith("user:") ? userStore : ipStore
    const key = identifier

    let record = store.get(key)

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + intervalMs }
    }

    record.count++
    store.set(key, record)

    const remaining = Math.max(0, maxRequests - record.count)
    const resetAt = record.resetAt

    if (record.count > maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt - now) / 1000),
      }
    }

    return {
      success: true,
      remaining,
      resetAt,
    }
  }
}

// Pre-configured rate limiters for different use cases
export const rateLimiters = {
  // API endpoints: 100 requests per minute per IP
  api: createRateLimiter({ intervalMs: 60_000, maxRequests: 100 }),
  
  // Order creation: 10 requests per minute per user
  orderCreate: createRateLimiter({ intervalMs: 60_000, maxRequests: 10 }),
  
  // Chat messages: 30 requests per minute per user
  chat: createRateLimiter({ intervalMs: 60_000, maxRequests: 30 }),
  
  // Auth endpoints: 5 requests per minute per IP
  auth: createRateLimiter({ intervalMs: 60_000, maxRequests: 5 }),
  
  // Password reset: 3 requests per minute per IP
  passwordReset: createRateLimiter({ intervalMs: 60_000, maxRequests: 3 }),
  
  // Admin actions: 50 requests per minute per user
  admin: createRateLimiter({ intervalMs: 60_000, maxRequests: 50 }),
}

export function getRateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.remaining + (result.success ? 0 : 1)),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
    ...(result.retryAfter && { "Retry-After": String(result.retryAfter) }),
  }
}

// Middleware helper for Next.js API routes
export function checkRateLimit(
  identifier: string,
  limiter: ReturnType<typeof createRateLimiter>
): { ok: boolean; headers?: Record<string, string>; retryAfter?: number } {
  const result = limiter(identifier)
  
  if (!result.success) {
    return {
      ok: false,
      headers: getRateLimitHeaders(result),
      retryAfter: result.retryAfter,
    }
  }

  return {
    ok: true,
    headers: getRateLimitHeaders(result),
  }
}
