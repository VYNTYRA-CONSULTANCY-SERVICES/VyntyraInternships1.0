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
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`MongoDB connected to ${mongoose.connection.name}`);
  } catch (error) {
    console.error("MongoDB connection failed", error);
    throw error;
  }
};

export default connectDB;
