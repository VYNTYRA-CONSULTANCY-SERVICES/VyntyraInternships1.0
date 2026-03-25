import mongoose from "mongoose";

const defaultUri = "mongodb://127.0.0.1:27017/vyntyra-internships";

const connectDB = async (uri) => {
  const connectionString = uri ?? defaultUri;
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !uri) {
    throw new Error("MONGODB_URI is required in production environment");
  }

  try {
    await mongoose.connect(connectionString, {
      // Connection pooling - maintain up to 10 connections
      maxPoolSize: 10,
      minPoolSize: 2,
      // Timeout settings for better performance
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 5000,
      // Retry settings
      retryWrites: true,
      maxAttempts: 3,
      // Create connection early
      waitQueueTimeoutMS: 10000,
    });
    console.log(`MongoDB connected to ${mongoose.connection.name}`);
    
    // Optimize queries with indexes
    mongoose.set('strictPopulate', false);
  } catch (error) {
    console.error("MongoDB connection failed", error);
    // Don't block server startup - fail asynchronously
    setTimeout(() => process.exit(1), 5000);
  }
};

export default connectDB;
