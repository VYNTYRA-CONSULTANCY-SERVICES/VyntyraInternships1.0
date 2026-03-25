import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
    required: true,
    unique: true,
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
  },
  razorpaySignature: {
    type: String,
    unique: true,
    sparse: true,
  },
  amount: {
    type: Number,
    required: true,
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
  },
  createdAt: {
    type: Date,
    default: () => new Date(),
  },
  updatedAt: {
    type: Date,
    default: () => new Date(),
  },
});

paymentSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
