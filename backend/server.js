import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { randomUUID } from "crypto";
import path from "path";
import dotenv from "dotenv";

import connectDB from "./src/config/db.js";
import applicationsRouter from "./src/routes/applications.js";
import paymentsRouter from "./src/routes/payments.js";
import { startBackgroundServices } from "./src/services/bootstrap.js";

dotenv.config();

const app = express();

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://internships.vyntyraconsultancyservices.in",
  "https://vyntyraconsultancyservices.in",
];

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || defaultAllowedOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowNetlifyPreviews = String(process.env.ALLOW_NETLIFY_PREVIEWS ?? "true").toLowerCase() === "true";
const enableRequestTimingLogs = String(
  process.env.ENABLE_REQUEST_TIMING_LOGS ?? (process.env.NODE_ENV === "production" ? "true" : "false")
).toLowerCase() === "true";
const requestTimingSampleRateRaw = Number(process.env.REQUEST_TIMING_SAMPLE_RATE ?? 1);
const requestTimingSampleRate = Number.isFinite(requestTimingSampleRateRaw)
  ? Math.max(0, Math.min(1, requestTimingSampleRateRaw))
  : 1;

function isNetlifyPreviewOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".netlify.app");
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server and curl-like calls without Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    const isAllowed = allowedOrigins.includes(origin)
      || (allowNetlifyPreviews && isNetlifyPreviewOrigin(origin));
    if (isAllowed) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(compression()); // Enable gzip compression for responses
app.use(express.json({ limit: "10mb" })); // Increase payload limit for large files
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (enableRequestTimingLogs) {
  app.use((req, res, next) => {
    if (Math.random() > requestTimingSampleRate) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    const requestId = String(req.headers["x-request-id"] || randomUUID());
    res.setHeader("x-request-id", requestId);

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const contentLength = res.getHeader("content-length") ?? "-";
      console.log(
        `[request-timing] id=${requestId} method=${req.method} path=${req.originalUrl} status=${res.statusCode} durationMs=${durationMs.toFixed(2)} bytes=${contentLength}`
      );
    });

    next();
  });
}

// Keep-alive endpoint for Render (prevents cold start)
app.get("/keep-alive", (_req, res) => {
  res.json({ status: "alive", timestamp: Date.now() });
});

const uploadsDir = process.env.UPLOAD_DIR ?? "uploads";
app.use("/uploads", express.static(path.resolve(process.cwd(), uploadsDir)));

app.use("/api/applications", applicationsRouter);
app.use("/api/payments", paymentsRouter);

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.statusCode ?? err.status ?? 500;
  const upstreamDescription = err?.error?.description || err?.error?.message;
  const message = err?.message || upstreamDescription || "Server error";
  res.status(status).json({ message });
});

const PORT = Number(process.env.PORT ?? 4000);

// Start server first (non-blocking approach for Render)
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

// Initialize database and background services in parallel (non-blocking)
connectDB(process.env.MONGODB_URI).catch((error) => {
  console.error("MongoDB bootstrap error", error);
});

// Start background services without blocking - fallbacks are handled
startBackgroundServices();
