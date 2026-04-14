import { Router } from "express";

const router = Router();

const GOOGLE_API_BASE = "https://maps.googleapis.com/maps/api/place";
const DEFAULT_QUERY_NAMES = [
  "Vyntyra Consultancy Services",
  "Vyntyra Consultancy Services pvt.ltd",
];
const CACHE_TTL_MS = 15 * 60 * 1000;

let cachedPayload = null;
let cachedAt = 0;

function normalizeArray(rawValue, fallback = []) {
  const parsed = String(rawValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function buildSearchUrl(platformLabel, query) {
  const platformPrefix = platformLabel ? `${platformLabel} ` : "";
  return `https://www.google.com/search?q=${encodeURIComponent(`${platformPrefix}${query}`)}`;
}

function buildProfiles(queryNames) {
  const joinedQuery = queryNames.join(" OR ");
  const primaryName = queryNames[0] || "Vyntyra Consultancy Services";

  return [
    {
      platform: "Google Maps Reviews",
      url: buildSearchUrl("Google Maps", joinedQuery),
      type: "search",
      note: "Find latest map listing and all user ratings",
    },
    {
      platform: "Glassdoor",
      url: buildSearchUrl("Glassdoor", primaryName),
      type: "search",
      note: "Company profile, salaries, interview and culture insights",
    },
    {
      platform: "Internshala",
      url: buildSearchUrl("Internshala", primaryName),
      type: "search",
      note: "Internship listings and employer profile",
    },
    {
      platform: "Indeed",
      url: buildSearchUrl("Indeed", primaryName),
      type: "search",
      note: "Company profile, jobs and employer reviews",
    },
    {
      platform: "AmbitionBox",
      url: buildSearchUrl("AmbitionBox", primaryName),
      type: "search",
      note: "Employee ratings and compensation trends",
    },
    {
      platform: "LinkedIn",
      url: "https://www.linkedin.com/company/vyntyra-consultancy-services",
      type: "direct",
      note: "Official company presence and updates",
    },
    {
      platform: "Company Website",
      url: "https://vyntyraconsultancyservices.in/",
      type: "direct",
      note: "Official information and contact channels",
    },
  ];
}

function sanitizeReview(review) {
  if (!review) return null;
  return {
    authorName: String(review.author_name || "Anonymous"),
    rating: Number(review.rating || 0),
    text: String(review.text || "").trim(),
    relativeTimeDescription: String(review.relative_time_description || "Recently"),
    authorUrl: review.author_url || null,
    profilePhotoUrl: review.profile_photo_url || null,
    time: Number(review.time || 0),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Upstream request failed with status ${response.status}`);
  }
  return response.json();
}

async function resolvePlaceIds({ apiKey, queryNames, placeIds }) {
  if (placeIds.length) {
    return placeIds;
  }

  const resolved = [];
  for (const query of queryNames) {
    const url = `${GOOGLE_API_BASE}/textsearch/json?query=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`;
    const payload = await fetchJson(url);
    const placeId = payload?.results?.[0]?.place_id;
    if (placeId) {
      resolved.push(placeId);
    }
  }

  return [...new Set(resolved)];
}

async function fetchBusinessDetails({ apiKey, placeId }) {
  const fields = [
    "name",
    "rating",
    "user_ratings_total",
    "reviews",
    "url",
    "website",
    "formatted_address",
  ].join(",");

  const url = `${GOOGLE_API_BASE}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields)}&reviews_sort=newest&key=${encodeURIComponent(apiKey)}`;
  const payload = await fetchJson(url);
  const result = payload?.result;
  if (!result) {
    return null;
  }

  const reviews = Array.isArray(result.reviews)
    ? result.reviews.map(sanitizeReview).filter(Boolean)
    : [];

  return {
    placeId,
    name: String(result.name || "Unknown business"),
    rating: Number(result.rating || 0),
    userRatingsTotal: Number(result.user_ratings_total || 0),
    mapUrl: result.url || null,
    website: result.website || null,
    address: result.formatted_address || null,
    reviews,
  };
}

function combineRatings(businesses) {
  const validBusinesses = businesses.filter((item) => Number(item.userRatingsTotal) > 0 && Number(item.rating) > 0);
  const totalRatings = validBusinesses.reduce((sum, item) => sum + Number(item.userRatingsTotal || 0), 0);
  const weightedTotal = validBusinesses.reduce(
    (sum, item) => sum + Number(item.rating || 0) * Number(item.userRatingsTotal || 0),
    0
  );

  const averageRating = totalRatings > 0 ? weightedTotal / totalRatings : 0;
  const totalReviewsShown = businesses.reduce((sum, item) => sum + (Array.isArray(item.reviews) ? item.reviews.length : 0), 0);

  return {
    averageRating: Number(averageRating.toFixed(2)),
    totalRatings,
    totalReviewsShown,
  };
}

async function buildReputationPayload() {
  const apiKey = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  const queryNames = normalizeArray(process.env.GOOGLE_REVIEW_QUERY_NAMES, DEFAULT_QUERY_NAMES);
  const placeIds = normalizeArray(process.env.GOOGLE_PLACE_IDS, []);
  const profiles = buildProfiles(queryNames);

  if (!apiKey) {
    return {
      source: "fallback",
      autoUpdated: false,
      message: "Set GOOGLE_PLACES_API_KEY to enable automatic Google review sync.",
      generatedAt: new Date().toISOString(),
      queryNames,
      google: {
        businesses: [],
        combined: {
          averageRating: 0,
          totalRatings: 0,
          totalReviewsShown: 0,
        },
      },
      profiles,
    };
  }

  const resolvedPlaceIds = await resolvePlaceIds({ apiKey, queryNames, placeIds });
  const businesses = [];

  for (const placeId of resolvedPlaceIds) {
    const business = await fetchBusinessDetails({ apiKey, placeId });
    if (business) {
      businesses.push(business);
    }
  }

  return {
    source: "google_places_api",
    autoUpdated: true,
    generatedAt: new Date().toISOString(),
    queryNames,
    google: {
      businesses,
      combined: combineRatings(businesses),
    },
    profiles,
  };
}

router.get("/overview", async (_req, res, next) => {
  try {
    const shouldUseCache = Date.now() - cachedAt < CACHE_TTL_MS && cachedPayload;
    if (shouldUseCache) {
      return res.json(cachedPayload);
    }

    const payload = await buildReputationPayload();
    cachedPayload = payload;
    cachedAt = Date.now();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

export default router;
