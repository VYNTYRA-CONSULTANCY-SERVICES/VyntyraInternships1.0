import mongoose from "mongoose";

const defaultUri = "mongodb://127.0.0.1:27017/vyntyra-internships";
const RETRY_DELAY_MS = Number(process.env.MONGODB_RETRY_DELAY_MS ?? 5000);

let reconnectTimer;
let lifecycleHooksAttached = false;
let connecting = false;

const scheduleReconnect = (connectionString) => {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectDB(connectionString).catch((error) => {
      console.error("MongoDB reconnect attempt failed", error?.message || error);
    });
  }, RETRY_DELAY_MS);
};

const connectDB = async (uri) => {
  const connectionString = uri ?? defaultUri;
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !uri) {
    throw new Error("MONGODB_URI is required in production environment");
  }

  if (mongoose.connection.readyState === 1 || connecting) {
    return;
  }

  connecting = true;

  try {
    await mongoose.connect(connectionString, {
      // Connection pooling - maintain up to 10 connections
      maxPoolSize: 10,
      minPoolSize: 2,
      // Timeout settings for better performance
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 5000,
      // Retry writes at Mongo driver level
      retryWrites: true,
      waitQueueTimeoutMS: 10000,
    });
    console.log(`MongoDB connected to ${mongoose.connection.name}`);

    // Optimize queries with indexes
    mongoose.set("strictPopulate", false);

    if (!lifecycleHooksAttached) {
      lifecycleHooksAttached = true;
      mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB disconnected. Scheduling reconnect.");
        scheduleReconnect(connectionString);
      });
      mongoose.connection.on("error", (error) => {
        console.warn("MongoDB connection error", error?.message);
      });
    }
  } catch (error) {
    console.error("MongoDB connection failed", error);
    // Keep API process alive and retry in background.
    scheduleReconnect(connectionString);
  } finally {
    connecting = false;
  }
};

export default connectDB;
