import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
    required: true,
    unique: true,
    index: true,
  },
  razorpayOrderId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  razorpayPaymentId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  razorpaySignature: {
    type: String,
    unique: true,
    sparse: true,
  },
  amount: {
    type: Number,
    required: true,
    index: true,
  },
  gateway: {
    type: String,
    enum: ["razorpay", "payu"],
    default: "razorpay",
    index: true,
  },
  payuTxnId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  payuPaymentId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  payuHash: {
    type: String,
    sparse: true,
  },
  payuUnmappedStatus: {
    type: String,
    sparse: true,
  },
  currency: {
    type: String,
    default: "INR",
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
    index: true,
  },
  method: {
    type: String,
    enum: ["upi", "card", "netbanking", "wallet", null],
    default: null,
  },
  vpa: {
    type: String,
    sparse: true,
  },
  cardLast4: {
    type: String,
    sparse: true,
  },
  contact: {
    type: String,
    sparse: true,
  },
  timestamp: {
    type: Date,
    sparse: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: () => new Date(),
    index: true,
  },
  updatedAt: {
    type: Date,
    default: () => new Date(),
    index: true,
  },
});

// Compound indexes for faster queries
paymentSchema.index({ applicationId: 1, status: 1 });
paymentSchema.index({ razorpayOrderId: 1, status: 1 });
paymentSchema.index({ payuTxnId: 1, status: 1 });
paymentSchema.index({ gateway: 1, status: 1 });
paymentSchema.index({ createdAt: -1 }); // For recent payments query

paymentSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
