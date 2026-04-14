import mongoose from "mongoose";

const visitorGeoSchema = new mongoose.Schema(
  {
    country: { type: String, default: null },
    region: { type: String, default: null },
    city: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { _id: false }
);

const visitorHitSchema = new mongoose.Schema({
  key: { type: String, required: true, index: true },
  count: { type: Number, required: true, index: true },
  occurredAt: { type: Date, default: () => new Date(), index: true },
  deviceType: { type: String, default: null, index: true },
  ipAddress: { type: String, default: null, index: true },
  geoLocation: { type: visitorGeoSchema, default: null },
  source: { type: String, default: "direct", index: true },
  sourceDetail: { type: String, default: null },
  userAgent: { type: String, default: null },
  referrer: { type: String, default: null },
  createdAt: { type: Date, default: () => new Date(), index: true },
  updatedAt: { type: Date, default: () => new Date(), index: true },
});

visitorHitSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const VisitorHit = mongoose.model("VisitorHit", visitorHitSchema);

export default VisitorHit;