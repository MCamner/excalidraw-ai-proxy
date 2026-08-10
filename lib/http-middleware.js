export function createRateLimiter({ windowMs, maxRequests, now = Date.now }) {
  const buckets = new Map();
  let nextSweepAt = now() + windowMs;

  const middleware = (req, res, next) => {
    const currentTime = now();

    if (currentTime >= nextSweepAt) {
      for (const [key, bucket] of buckets) {
        if (currentTime >= bucket.resetAt) {
          buckets.delete(key);
        }
      }
      nextSweepAt = currentTime + windowMs;
    }

    const key = req.ip || req.socket.remoteAddress || "local";
    const bucket = buckets.get(key);

    if (!bucket || currentTime >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - currentTime) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ message: "Too many requests", retryAfterSeconds });
      return;
    }

    next();
  };

  middleware.bucketCount = () => buckets.size;
  return middleware;
}

export function createCorsOptions(allowedOrigins) {
  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      const error = new Error("Origin not allowed by CORS");
      error.status = 403;
      callback(error);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
  };
}

export function handleHttpError(error, res) {
  const statusCode = error?.status || error?.statusCode || 500;
  console.error(JSON.stringify({
    event: "request_failed",
    statusCode,
    errorType: error?.name || "Error",
  }));
  res.status(statusCode).json({
    message: statusCode >= 500 ? "Upstream service error" : "Request failed",
    statusCode,
  });
}
