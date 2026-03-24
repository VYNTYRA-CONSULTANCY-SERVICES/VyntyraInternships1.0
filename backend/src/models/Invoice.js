import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema({
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
    required: true,
    unique: true,
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  candidateName: {
    type: String,
    required: true,
  },
  candidateEmail: {
    type: String,
    required: true,
  },
  paymentDetails: {
    method: String,
    timestamp: Date,
    transactionId: String,
    last4OrVpa: String,
    amount: Number,
    currency: String,
  },
  invoiceUrl: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["generated", "sent", "failed"],
    default: "generated",
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

invoiceSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Invoice = mongoose.model("Invoice", invoiceSchema);

export default Invoice;
