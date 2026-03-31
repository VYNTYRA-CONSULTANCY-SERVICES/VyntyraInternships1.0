import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

counterSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Counter = mongoose.model("Counter", counterSchema);

export default Counter;
