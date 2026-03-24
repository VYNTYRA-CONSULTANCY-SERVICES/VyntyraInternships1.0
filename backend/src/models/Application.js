import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, index: true },
  linkedinUrl: { type: String, required: true },
  collegeName: { type: String, required: true },
  collegeLocation: { type: String, required: true },
  preferredDomain: { type: String, required: true },
  languages: { type: String, required: true },
  remoteComfort: { type: String, required: true },
  placementContact: { type: String, required: true },
  resumePath: { type: String },
  resumeUrl: { type: String, sparse: true },
  consent: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ["PENDING_PAYMENT", "COMPLETED_AND_PAID", "FAILED"],
    default: "PENDING_PAYMENT",
    index: true,
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    sparse: true,
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    sparse: true,
  },
  numReminders: {
    type: Number,
    default: 0,
  },
  lastReminderSentAt: {
    type: Date,
    sparse: true,
  },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() },
});

applicationSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Application = mongoose.model("Application", applicationSchema, "Interns_Data");

export default Application;
