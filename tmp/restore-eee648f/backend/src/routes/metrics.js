import { Router } from "express";

import Counter from "../models/Counter.js";
import VisitorHit from "../models/VisitorHit.js";

const router = Router();
const VISITOR_COUNTER_KEY = "visitors:internships-home";

const normalizeText = (value) => {
  const text = String(value || "").trim();
  return text.length ? text : null;
};

const getRequestIpAddress = (req) => {
  const forwardedFor = normalizeText(req.headers["x-forwarded-for"]);
  const cfConnectingIp = normalizeText(req.headers["cf-connecting-ip"]);

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return cfConnectingIp || normalizeText(req.ip) || null;
};

const detectDeviceType = (userAgent) => {
  const ua = String(userAgent || "").toLowerCase();
  if (/tablet|ipad/.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod|windows phone/.test(ua)) return "mobile";
  if (ua) return "desktop";
  return null;
};

const detectSource = ({ referrer, utmSource }) => {
  const sourceHint = normalizeText(utmSource)?.toLowerCase();
  if (sourceHint) {
    return sourceHint;
  }

  const ref = normalizeText(referrer)?.toLowerCase();
  if (!ref) {
    return "direct";
  }

  if (ref.includes("facebook.com") || ref.includes("m.facebook.com") || ref.includes("fb.com")) return "facebook";
  if (ref.includes("instagram.com")) return "instagram";
  if (ref.includes("linkedin.com")) return "linkedin";
  if (ref.includes("whatsapp.com") || ref.includes("wa.me")) return "whatsapp";
  if (ref.includes("google.") || ref.includes("bing.") || ref.includes("yahoo.") || ref.includes("duckduckgo.")) return "search";
  return "external";
};

const buildGeoLocation = (req) => {
  const country = normalizeText(req.headers["cf-ipcountry"] || req.headers["x-vercel-ip-country"]);
  const region = normalizeText(req.headers["cf-region"] || req.headers["x-vercel-ip-country-region"]);
  const city = normalizeText(req.headers["cf-ipcity"] || req.headers["x-vercel-ip-city"]);
  const latitude = Number(req.headers["cf-iplatitude"] || req.headers["x-vercel-ip-latitude"]);
  const longitude = Number(req.headers["cf-iplongitude"] || req.headers["x-vercel-ip-longitude"]);

  if (!country && !region && !city && !Number.isFinite(latitude) && !Number.isFinite(longitude)) {
    return null;
  }

  return {
    country,
    region,
    city,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
};

const getVisitorCount = async () => {
  const counter = await Counter.findOne({ key: VISITOR_COUNTER_KEY }).lean();
  return Number(counter?.seq || 0);
};

router.get("/visitors", async (_req, res, next) => {
  try {
    const count = await getVisitorCount();
    return res.json({ count });
  } catch (error) {
    return next(error);
  }
});

router.post("/visitors/hit", async (_req, res, next) => {
  try {
    const counter = await Counter.findOneAndUpdate(
      { key: VISITOR_COUNTER_KEY },
      {
        $inc: { seq: 1 },
        $setOnInsert: { key: VISITOR_COUNTER_KEY, createdAt: new Date(), seq: 0 },
        $set: { updatedAt: new Date() },
      },
      { new: true, upsert: true }
    ).lean();

    const payload = req.body || {};
    const userAgent = normalizeText(payload.userAgent || req.headers["user-agent"]);
    const referrer = normalizeText(payload.referrer || req.headers.referer || req.headers.referrer);
    const utmSource = normalizeText(payload.utmSource);
    const source = detectSource({ referrer, utmSource });
    const sourceDetail = normalizeText(payload.sourceDetail) || referrer;

    await VisitorHit.create({
      key: VISITOR_COUNTER_KEY,
      count: Number(counter?.seq || 0),
      occurredAt: new Date(),
      deviceType: detectDeviceType(userAgent),
      ipAddress: getRequestIpAddress(req),
      geoLocation: buildGeoLocation(req),
      source,
      sourceDetail,
      userAgent,
      referrer,
    });

    return res.status(201).json({ count: Number(counter?.seq || 0) });
  } catch (error) {
    return next(error);
  }
});

export default router;
