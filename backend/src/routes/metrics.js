import { Router } from "express";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import Counter from "../models/Counter.js";
import VisitorHit from "../models/VisitorHit.js";

const router = Router();
const VISITOR_COUNTER_KEY = "visitors:internships-home";
const GOOGLE_PLACE_QUERIES = [
  "Vyntyra Consultancy Services",
  "Vyntyra Consultancy Services Pvt Ltd",
];
const GOOGLE_PLACE_DETAILS_ENDPOINT = "https://maps.googleapis.com/maps/api/place/details/json";
const GOOGLE_FIND_PLACE_ENDPOINT = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const GOOGLE_PUBLIC_SEARCH_ENDPOINT = "https://www.google.com/search";
const GOOGLE_REVIEW_CACHE_TTL_MS_RAW = Number(process.env.GOOGLE_REVIEW_CACHE_TTL_MS ?? 15 * 60 * 1000);
const GOOGLE_REVIEW_CACHE_TTL_MS = Number.isFinite(GOOGLE_REVIEW_CACHE_TTL_MS_RAW)
  ? Math.max(60 * 1000, GOOGLE_REVIEW_CACHE_TTL_MS_RAW)
  : 15 * 60 * 1000;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const GOOGLE_REVIEW_SNAPSHOT_PATH = process.env.GOOGLE_REVIEW_SNAPSHOT_FILE
  ? path.resolve(process.env.GOOGLE_REVIEW_SNAPSHOT_FILE)
  : path.resolve(MODULE_DIR, "../../data/google_reviews_snapshot.json");

let googleReviewCache = {
  updatedAt: 0,
  data: null,
};

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

const readGooglePlaceIdsFromEnv = () => {
  const fromList = String(process.env.GOOGLE_PLACES_PLACE_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const fromSingleValues = [
    process.env.GOOGLE_PLACES_PRIMARY_PLACE_ID,
    process.env.GOOGLE_PLACES_SECONDARY_PLACE_ID,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return [...new Set([...fromList, ...fromSingleValues])];
};

const isValidSnapshotPayload = (payload) => {
  if (!payload || typeof payload !== "object") return false;
  if (!payload.aggregate || typeof payload.aggregate !== "object") return false;
  const avg = Number(payload.aggregate.averageRating || 0);
  const total = Number(payload.aggregate.totalRatings || 0);
  return Number.isFinite(avg) && Number.isFinite(total) && total >= 0;
};

const readSnapshotFromDisk = async () => {
  try {
    const raw = await readFile(GOOGLE_REVIEW_SNAPSHOT_PATH, "utf8");
    const payload = JSON.parse(raw);
    if (!isValidSnapshotPayload(payload)) {
      return null;
    }

    return {
      ...payload,
      source: normalizeText(payload.source) || "python-google-snapshot",
      updatedAt: normalizeText(payload.updatedAt) || new Date().toISOString(),
      cached: false,
      cacheTtlMs: GOOGLE_REVIEW_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
};

const fetchJsonWithTimeout = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream status ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchTextWithTimeout = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; VyntyraBot/1.0; +https://vyntyraconsultancyservices.in)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream status ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
};

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const collectJsonLdNodes = (html) => {
  const nodes = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match = regex.exec(html);

  while (match) {
    const parsed = safeJsonParse(match[1]);
    if (parsed) nodes.push(parsed);
    match = regex.exec(html);
  }

  return nodes;
};

const extractAggregateFromJsonLd = (jsonLdNode) => {
  const candidates = [];

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    candidates.push(node);
    Object.values(node).forEach(walk);
  };

  walk(jsonLdNode);

  for (const candidate of candidates) {
    const aggregate = candidate.aggregateRating;
    if (!aggregate || typeof aggregate !== "object") continue;

    const rating = toNumberOrNull(aggregate.ratingValue);
    const totalRatings = toNumberOrNull(aggregate.reviewCount || aggregate.ratingCount);
    const name = normalizeText(candidate.name);
    const reviews = toArray(candidate.review)
      .map((review) => ({
        authorName: normalizeText(review?.author?.name || review?.author) || "Google User",
        profilePhotoUrl: null,
        rating: Number(toNumberOrNull(review?.reviewRating?.ratingValue) || 0),
        text: normalizeText(review?.reviewBody || review?.description),
        relativeTimeDescription: normalizeText(review?.datePublished),
        publishedAtEpoch: 0,
        sourceUrl: null,
      }))
      .filter((review) => review.text);

    if (rating && totalRatings) {
      return {
        placeId: null,
        name,
        mapUrl: null,
        address: normalizeText(candidate.address?.streetAddress || candidate.address),
        rating,
        totalRatings,
        reviews,
      };
    }
  }

  return null;
};

const extractAggregateFromRawHtml = (html, query) => {
  const ratingMatch = html.match(/"ratingValue"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i)
    || html.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:out of|\/\s*5)\s*stars?/i);
  const countMatch = html.match(/"reviewCount"\s*:\s*"?([0-9,]+)"?/i)
    || html.match(/([0-9,]+)\s+Google\s+reviews?/i)
    || html.match(/([0-9,]+)\s+reviews?/i);

  const rating = toNumberOrNull(ratingMatch?.[1]);
  const totalRatings = toNumberOrNull(countMatch?.[1]);

  if (!rating || !totalRatings) {
    return null;
  }

  return {
    placeId: null,
    name: query,
    mapUrl: null,
    address: null,
    rating,
    totalRatings,
    reviews: [],
  };
};

const fetchGooglePublicSnapshotByQuery = async (query) => {
  const searchUrl = new URL(GOOGLE_PUBLIC_SEARCH_ENDPOINT);
  searchUrl.searchParams.set("q", `${query} google reviews`);
  searchUrl.searchParams.set("hl", "en");
  searchUrl.searchParams.set("gl", "in");
  searchUrl.searchParams.set("num", "10");

  const html = await fetchTextWithTimeout(searchUrl.toString());
  const jsonLdNodes = collectJsonLdNodes(html);

  for (const node of jsonLdNodes) {
    const aggregate = extractAggregateFromJsonLd(node);
    if (aggregate) {
      return aggregate;
    }
  }

  return extractAggregateFromRawHtml(html, query);
};

const buildGoogleSnapshotPayload = ({ source, places }) => {
  const weightedRatingSum = places.reduce((sum, place) => sum + place.rating * place.totalRatings, 0);
  const totalRatings = places.reduce((sum, place) => sum + place.totalRatings, 0);
  const averageRating = totalRatings > 0 ? Number((weightedRatingSum / totalRatings).toFixed(2)) : 0;

  const mergedReviews = places
    .flatMap((place) =>
      (Array.isArray(place.reviews) ? place.reviews : []).map((review) => ({
        ...review,
        placeId: place.placeId,
        placeName: place.name,
        placeMapUrl: place.mapUrl,
      }))
    )
    .filter((review) => review.text);

  return {
    source,
    updatedAt: new Date().toISOString(),
    places,
    aggregate: {
      averageRating,
      totalRatings,
      totalPlaces: places.length,
    },
    reviews: mergedReviews,
    cached: false,
    cacheTtlMs: GOOGLE_REVIEW_CACHE_TTL_MS,
  };
};

const getGoogleReviewSnapshotFromPublicSearch = async () => {
  const placesRaw = await Promise.all(
    GOOGLE_PLACE_QUERIES.map((query) => fetchGooglePublicSnapshotByQuery(query).catch(() => null))
  );
  const places = placesRaw.filter((place) => place && Number(place.rating) > 0 && Number(place.totalRatings) > 0);

  if (!places.length) {
    const upstreamError = new Error("Unable to fetch Google reviews from public source");
    upstreamError.statusCode = 502;
    throw upstreamError;
  }

  return buildGoogleSnapshotPayload({ source: "google-public-search", places });
};

const findGooglePlaceIdByQuery = async ({ apiKey, query }) => {
  const url = new URL(GOOGLE_FIND_PLACE_ENDPOINT);
  url.searchParams.set("input", query);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id,name");
  url.searchParams.set("key", apiKey);

  const payload = await fetchJsonWithTimeout(url.toString());
  if (payload?.status !== "OK" && payload?.status !== "ZERO_RESULTS") {
    throw new Error(payload?.error_message || `Find Place failed with status ${payload?.status || "unknown"}`);
  }

  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  return String(candidate?.place_id || "").trim() || null;
};

const fetchGooglePlaceDetails = async ({ apiKey, placeId }) => {
  const url = new URL(GOOGLE_PLACE_DETAILS_ENDPOINT);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    "name,rating,user_ratings_total,reviews,url,formatted_address,place_id"
  );
  url.searchParams.set("reviews_sort", "newest");
  url.searchParams.set("key", apiKey);

  const payload = await fetchJsonWithTimeout(url.toString());
  if (payload?.status !== "OK") {
    throw new Error(payload?.error_message || `Place Details failed with status ${payload?.status || "unknown"}`);
  }

  const result = payload?.result || {};
  const reviews = Array.isArray(result.reviews)
    ? result.reviews.map((review) => ({
      authorName: normalizeText(review?.author_name) || "Google User",
      profilePhotoUrl: normalizeText(review?.profile_photo_url),
      rating: Number(review?.rating || 0),
      text: normalizeText(review?.text),
      relativeTimeDescription: normalizeText(review?.relative_time_description),
      publishedAtEpoch: Number(review?.time || 0),
      sourceUrl: normalizeText(review?.author_url),
    }))
    : [];

  return {
    placeId: normalizeText(result.place_id) || placeId,
    name: normalizeText(result.name),
    mapUrl: normalizeText(result.url),
    address: normalizeText(result.formatted_address),
    rating: Number(result.rating || 0),
    totalRatings: Number(result.user_ratings_total || 0),
    reviews,
  };
};

const getGoogleReviewSnapshot = async () => {
  const now = Date.now();
  const isCacheFresh = googleReviewCache.data && now - googleReviewCache.updatedAt < GOOGLE_REVIEW_CACHE_TTL_MS;
  if (isCacheFresh) {
    return {
      ...googleReviewCache.data,
      cached: true,
      cacheTtlMs: GOOGLE_REVIEW_CACHE_TTL_MS,
    };
  }

  const snapshotPayload = await readSnapshotFromDisk();
  if (snapshotPayload) {
    googleReviewCache = {
      updatedAt: now,
      data: snapshotPayload,
    };
    return snapshotPayload;
  }

  const apiKey = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!apiKey) {
    const payload = await getGoogleReviewSnapshotFromPublicSearch();
    googleReviewCache = {
      updatedAt: now,
      data: payload,
    };
    return payload;
  }

  let placeIds = readGooglePlaceIdsFromEnv();
  if (!placeIds.length) {
    const discoveredPlaceIds = await Promise.all(
      GOOGLE_PLACE_QUERIES.map((query) => findGooglePlaceIdByQuery({ apiKey, query }).catch(() => null))
    );
    placeIds = [...new Set(discoveredPlaceIds.filter(Boolean))];
  }

  if (!placeIds.length) {
    const notFoundError = new Error("No Google Place IDs found for configured Vyntyra queries");
    notFoundError.statusCode = 404;
    throw notFoundError;
  }

  const placesRaw = await Promise.all(
    placeIds.map((placeId) => fetchGooglePlaceDetails({ apiKey, placeId }).catch(() => null))
  );
  const places = placesRaw.filter(Boolean);

  if (!places.length) {
    const upstreamError = new Error("Unable to fetch Google place details");
    upstreamError.statusCode = 502;
    throw upstreamError;
  }

  const payload = buildGoogleSnapshotPayload({ source: "google-places-api", places });

  googleReviewCache = {
    updatedAt: now,
    data: payload,
  };

  return payload;
};

router.get("/visitors", async (_req, res, next) => {
  try {
    const count = await getVisitorCount();
    return res.json({ count });
  } catch (error) {
    return next(error);
  }
});

router.get("/reviews/google", async (_req, res, next) => {
  try {
    const payload = await getGoogleReviewSnapshot();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post("/visitors/hit", async (req, res, next) => {
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
