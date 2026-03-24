import express from "express";
import cors from "cors";
import helmet from "helmet";
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

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server and curl-like calls without Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    const isAllowed = allowedOrigins.includes(origin);
    if (isAllowed) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

connectDB(process.env.MONGODB_URI)
  .then(async () => {
    await startBackgroundServices();
    app.listen(PORT, () => {
      console.log(`Listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
