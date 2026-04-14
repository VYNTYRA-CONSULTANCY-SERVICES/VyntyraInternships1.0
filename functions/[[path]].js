import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import crypto from "node:crypto";

/**
 * Cloudflare Pages Function (Hono)
 * Replaces Express + Mongo + multer with:
 * - D1 for relational data
 * - R2 for resume file storage
 * - Stateless webhook endpoints for Razorpay/PayU
 */

const app = new Hono();

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

const asJson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: jsonHeaders });
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function parseAllowedOrigins(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(origin, allowedOrigins) {
  if (!origin) return "*";
  if (allowedOrigins.length === 0) return "*";
  return allowedOrigins.includes(origin) ? origin : "null";
}

const withBindingsValidation = createMiddleware(async (c, next) => {
  if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
  if (!c.env.RESUMES) return c.json({ message: "R2 binding RESUMES is missing" }, 500);
  await next();
});

app.use("/api/*", async (c, next) => {
  const allowed = parseAllowedOrigins(c.env.CORS_ALLOWED_ORIGINS);
  const requestOrigin = c.req.header("origin") || "";
  const origin = resolveCorsOrigin(requestOrigin, allowed);

  const corsMw = cors({
    origin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Razorpay-Signature"],
    exposeHeaders: ["Content-Type"],
    maxAge: 86400,
    credentials: false,
  });

  return corsMw(c, next);
});

app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
});

app.get("/keep-alive", (c) => c.json({ status: "alive", ts: Date.now() }));
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

const VISITOR_COUNTER_KEY = "visitors:internships-home";

const ensureVisitorCounterTable = async (db) => {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS visitor_counters (
        key TEXT PRIMARY KEY,
        total_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
};

app.get("/api/metrics/visitors", async (c) => {
  try {
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
    await ensureVisitorCounterTable(c.env.DB);

    const row = await c.env.DB.prepare("SELECT total_count FROM visitor_counters WHERE key = ?")
      .bind(VISITOR_COUNTER_KEY)
      .first();

    return c.json({ count: Number(row?.total_count || 0) });
  } catch (error) {
    console.error("/api/metrics/visitors error", error);
    return c.json({ message: "Failed to fetch total visitors" }, 500);
  }
});

app.post("/api/metrics/visitors/hit", async (c) => {
  try {
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
    await ensureVisitorCounterTable(c.env.DB);

    await c.env.DB.prepare(
      `INSERT INTO visitor_counters (key, total_count, updated_at)
       VALUES (?, 1, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         total_count = total_count + 1,
         updated_at = datetime('now')`
    )
      .bind(VISITOR_COUNTER_KEY)
      .run();

    const row = await c.env.DB.prepare("SELECT total_count FROM visitor_counters WHERE key = ?")
      .bind(VISITOR_COUNTER_KEY)
      .first();

    return c.json({ count: Number(row?.total_count || 0) }, 201);
  } catch (error) {
    console.error("/api/metrics/visitors/hit error", error);
    return c.json({ message: "Failed to update total visitors" }, 500);
  }
});

const requiredFields = [
  "full_name",
  "phone",
  "email",
  "linkedin_url",
  "college_name",
  "college_location",
  "preferred_domain",
  "languages",
  "remote_comfort",
  "placement_contact",
];

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

app.post("/api/applications", async (c) => {
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
    if (!c.env.RESUMES) return c.json({ message: "R2 binding RESUMES is missing" }, 500);
  try {
    const form = await c.req.formData();

    for (const field of requiredFields) {
      const value = String(form.get(field) || "").trim();
      if (!value) {
        return c.json({ message: `Missing submission data: ${field}` }, 400);
      }
    }

    const consentRaw = String(form.get("consent") || "").toLowerCase();
    const consent = consentRaw === "true" || consentRaw === "on" || consentRaw === "1";
    if (!consent) {
      return c.json({ message: "You must consent to data processing before applying." }, 400);
    }

    const resumeLink = String(form.get("resume_link") || "").trim();
    const resumeFile = form.get("resume");
    const hasFile = resumeFile instanceof File && resumeFile.size > 0;

    if (!hasFile && !resumeLink) {
      return c.json({ message: "Provide either resume upload (PDF) or a public resume link." }, 400);
    }

    if (resumeLink && !isValidHttpUrl(resumeLink)) {
      return c.json({ message: "Resume link must be a valid public URL (http/https)." }, 400);
    }

    let resumeKey = null;
    let uploadedResumeUrl = null;

    if (hasFile) {
      const ext = (resumeFile.name.split(".").pop() || "").toLowerCase();
      if (ext !== "pdf") {
        return c.json({ message: "Resume must be a PDF document." }, 400);
      }

      if (resumeFile.size > 5 * 1024 * 1024) {
        return c.json({ message: "Resume exceeds 5MB upload limit." }, 400);
      }

      const appIdForKey = uuid();
      const safeName = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      resumeKey = `applications/${appIdForKey}/${Date.now()}-${safeName}`;

      await c.env.RESUMES.put(resumeKey, resumeFile.stream(), {
        httpMetadata: {
          contentType: "application/pdf",
        },
      });

      const publicBase = String(c.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
      if (publicBase) {
        uploadedResumeUrl = `${publicBase}/${resumeKey}`;
      }

      const applicationId = appIdForKey;
      const amount = Number.parseInt(String(form.get("internship_price") || c.env.APPLICATION_FEE_INR || "499"), 10);

      await c.env.DB.prepare(
        `INSERT INTO applications (
          id, full_name, phone, email, linkedin_url, college_name, college_location,
          preferred_domain, languages, remote_comfort, placement_contact,
          resume_key, resume_url, consent, status,
          duration_months, selected_addons, internship_price,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          applicationId,
          String(form.get("full_name")).trim(),
          String(form.get("phone")).trim(),
          String(form.get("email")).trim().toLowerCase(),
          String(form.get("linkedin_url")).trim(),
          String(form.get("college_name")).trim(),
          String(form.get("college_location")).trim(),
          String(form.get("preferred_domain")).trim(),
          String(form.get("languages")).trim(),
          String(form.get("remote_comfort")).trim(),
          String(form.get("placement_contact")).trim(),
          resumeKey,
          uploadedResumeUrl || resumeLink || null,
          1,
          "PENDING_PAYMENT",
          String(form.get("selected_duration") || "").trim() || null,
          String(form.get("selected_addons") || "").trim() || null,
          Number.isFinite(amount) && amount > 0 ? amount : 499,
          nowIso(),
          nowIso()
        )
        .run();

      return c.json(
        {
          message: "Application submitted. Please complete payment to secure your slot.",
          applicationId,
          status: "PENDING_PAYMENT",
        },
        201
      );
    }

    const applicationId = uuid();
    const amount = Number.parseInt(String(form.get("internship_price") || c.env.APPLICATION_FEE_INR || "499"), 10);

    await c.env.DB.prepare(
      `INSERT INTO applications (
        id, full_name, phone, email, linkedin_url, college_name, college_location,
        preferred_domain, languages, remote_comfort, placement_contact,
        resume_key, resume_url, consent, status,
        duration_months, selected_addons, internship_price,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        applicationId,
        String(form.get("full_name")).trim(),
        String(form.get("phone")).trim(),
        String(form.get("email")).trim().toLowerCase(),
        String(form.get("linkedin_url")).trim(),
        String(form.get("college_name")).trim(),
        String(form.get("college_location")).trim(),
        String(form.get("preferred_domain")).trim(),
        String(form.get("languages")).trim(),
        String(form.get("remote_comfort")).trim(),
        String(form.get("placement_contact")).trim(),
        null,
        resumeLink,
        1,
        "PENDING_PAYMENT",
        String(form.get("selected_duration") || "").trim() || null,
        String(form.get("selected_addons") || "").trim() || null,
        Number.isFinite(amount) && amount > 0 ? amount : 499,
        nowIso(),
        nowIso()
      )
      .run();

    return c.json(
      {
        message: "Application submitted. Please complete payment to secure your slot.",
        applicationId,
        status: "PENDING_PAYMENT",
      },
      201
    );
  } catch (error) {
    console.error("/api/applications error", error);
    return c.json({ message: "Server error while submitting application." }, 500);
  }
});

function toTwoDecimals(value) {
  return Number(value).toFixed(2);
}

function sha512(value) {
  return crypto.createHash("sha512").update(value).digest("hex");
}

function mapPayUMethodToInternal(mode) {
  const normalized = String(mode || "").toLowerCase();
  if (normalized.includes("upi")) return "upi";
  if (normalized.includes("card")) return "card";
  if (normalized.includes("nb") || normalized.includes("netbanking")) return "netbanking";
  if (normalized.includes("wallet")) return "wallet";
  return null;
}

function buildPayUResponseHashString(payload, salt, key) {
  const status = String(payload.status || "");
  const udf1 = String(payload.udf1 || "");
  const udf2 = String(payload.udf2 || "");
  const udf3 = String(payload.udf3 || "");
  const udf4 = String(payload.udf4 || "");
  const udf5 = String(payload.udf5 || "");
  const udf6 = String(payload.udf6 || "");
  const udf7 = String(payload.udf7 || "");
  const udf8 = String(payload.udf8 || "");
  const udf9 = String(payload.udf9 || "");
  const udf10 = String(payload.udf10 || "");
  const email = String(payload.email || "");
  const firstname = String(payload.firstname || "");
  const productinfo = String(payload.productinfo || "");
  const amount = String(payload.amount || "");
  const txnid = String(payload.txnid || "");
  const additionalCharges = String(payload.additionalCharges || "");
  const base = `${salt}|${status}|${udf10}|${udf9}|${udf8}|${udf7}|${udf6}|${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  return additionalCharges ? `${additionalCharges}|${base}` : base;
}

app.post("/api/payments/create-order", async (c) => {
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
  try {
    const body = await c.req.json();
    const applicationId = String(body.applicationId || "").trim();
    const amountInRupees = Number(body.amount ?? c.env.APPLICATION_FEE_INR ?? 499);

    if (!applicationId || !Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return c.json({ message: "Missing applicationId or valid amount" }, 400);
    }

    const appRow = await c.env.DB.prepare("SELECT id, status, email, full_name FROM applications WHERE id = ?")
      .bind(applicationId)
      .first();

    if (!appRow) return c.json({ message: "Application not found" }, 404);
    if (appRow.status !== "PENDING_PAYMENT") return c.json({ message: "Application already processed" }, 400);

    const keyId = String(c.env.RAZORPAY_KEY_ID || "").trim();
    const keySecret = String(c.env.RAZORPAY_KEY_SECRET || "").trim();
    if (!keyId || !keySecret) {
      return c.json({ message: "Razorpay credentials missing" }, 500);
    }

    const basicAuth = btoa(`${keyId}:${keySecret}`);
    const amountInPaise = Math.round(amountInRupees * 100);
    const receipt = `app_${applicationId.slice(0, 20)}`;

    const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt,
        notes: {
          applicationId,
          email: String(appRow.email || ""),
          fullName: String(appRow.full_name || ""),
        },
      }),
    });

    const order = await rzpResponse.json();
    if (!rzpResponse.ok) {
      return c.json({ message: order?.error?.description || "Failed to create Razorpay order" }, 502);
    }

    const paymentId = uuid();
    await c.env.DB.prepare(
      `INSERT INTO payments (
        id, application_id, razorpay_order_id, amount, currency, gateway, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'razorpay', 'pending', ?, ?)
      ON CONFLICT(application_id) DO UPDATE SET
        razorpay_order_id = excluded.razorpay_order_id,
        amount = excluded.amount,
        currency = excluded.currency,
        gateway = excluded.gateway,
        status = 'pending',
        updated_at = excluded.updated_at`
    )
      .bind(paymentId, applicationId, order.id, amountInRupees, "INR", nowIso(), nowIso())
      .run();

    return c.json(
      {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId,
      },
      201
    );
  } catch (error) {
    console.error("/api/payments/create-order error", error);
    return c.json({ message: "Failed to create order" }, 500);
  }
});

app.post("/api/payments/verify", async (c) => {
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
  try {
    const body = await c.req.json();
    const razorpayOrderId = String(body.razorpayOrderId || "").trim();
    const razorpayPaymentId = String(body.razorpayPaymentId || "").trim();
    const razorpaySignature = String(body.razorpaySignature || "").trim();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return c.json({ message: "Missing payment details" }, 400);
    }

    const secret = String(c.env.RAZORPAY_KEY_SECRET || "").trim();
    if (!secret) return c.json({ message: "Razorpay secret missing" }, 500);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return c.json({ message: "Payment verification failed: Invalid signature" }, 400);
    }

    const payment = await c.env.DB.prepare("SELECT id, application_id FROM payments WHERE razorpay_order_id = ?")
      .bind(razorpayOrderId)
      .first();

    if (!payment) return c.json({ message: "Payment record not found" }, 404);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE payments
         SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'completed', timestamp = ?, updated_at = ?
         WHERE id = ?`
      ).bind(razorpayPaymentId, razorpaySignature, nowIso(), nowIso(), payment.id),
      c.env.DB.prepare(
        `UPDATE applications
         SET status = 'COMPLETED_AND_PAID', payment_id = ?, updated_at = ?
         WHERE id = ?`
      ).bind(payment.id, nowIso(), payment.application_id),
    ]);

    return c.json({
      message: "Payment verified successfully",
      applicationId: payment.application_id,
      status: "COMPLETED_AND_PAID",
    });
  } catch (error) {
    console.error("/api/payments/verify error", error);
    return c.json({ message: "Failed to verify payment" }, 500);
  }
});

app.post("/api/payments/payu/initiate", async (c) => {
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
  try {
    const body = await c.req.json();
    const applicationId = String(body.applicationId || "").trim();
    const amount = Number(body.amount ?? c.env.APPLICATION_FEE_INR ?? 499);

    if (!applicationId || !Number.isFinite(amount) || amount <= 0) {
      return c.json({ message: "Missing applicationId or valid amount" }, 400);
    }

    const appRow = await c.env.DB.prepare("SELECT id, status, full_name, email, phone FROM applications WHERE id = ?")
      .bind(applicationId)
      .first();

    if (!appRow) return c.json({ message: "Application not found" }, 404);
    if (appRow.status !== "PENDING_PAYMENT") return c.json({ message: "Application already processed" }, 400);

    const key = String(c.env.PAYU_MERCHANT_KEY || "").trim();
    const salt = String(c.env.PAYU_MERCHANT_SALT || "").trim();
    const payUBaseUrl = String(c.env.PAYU_BASE_URL || "https://secure.payu.in").replace(/\/+$/, "");

    if (!key || !salt) {
      return c.json({ message: "PayU credentials missing" }, 500);
    }

    const amountString = toTwoDecimals(amount);
    const txnid = `v${Date.now()}${applicationId.slice(-8)}`;
    const productinfo = "Vyntyra Internship Registration Fee";
    const firstname = String(appRow.full_name || "Candidate").trim().slice(0, 60);
    const email = String(appRow.email || "").trim();
    const phone = String(appRow.phone || "").trim();

    const backendBase = String(c.env.BACKEND_BASE_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
    const surl = `${backendBase}/api/payments/payu/callback`;
    const furl = `${backendBase}/api/payments/payu/callback`;

    const udf1 = applicationId;
    const udf2 = "";
    const udf3 = "";
    const udf4 = "";
    const udf5 = "";
    const udf6 = "";
    const udf7 = "";
    const udf8 = "";
    const udf9 = "";
    const udf10 = "";

    const hashString = `${key}|${txnid}|${amountString}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}|${udf6}|${udf7}|${udf8}|${udf9}|${udf10}|${salt}`;
    const hash = sha512(hashString);

    const paymentId = uuid();
    await c.env.DB.prepare(
      `INSERT INTO payments (
        id, application_id, gateway, payu_txn_id, amount, currency, status, created_at, updated_at
      ) VALUES (?, ?, 'payu', ?, ?, 'INR', 'pending', ?, ?)
      ON CONFLICT(application_id) DO UPDATE SET
        gateway = 'payu',
        payu_txn_id = excluded.payu_txn_id,
        amount = excluded.amount,
        currency = excluded.currency,
        status = 'pending',
        updated_at = excluded.updated_at`
    )
      .bind(paymentId, applicationId, txnid, amount, nowIso(), nowIso())
      .run();

    const frontendBase = String(c.env.FRONTEND_BASE_URL || "https://internships.vyntyraconsultancyservices.in").replace(/\/+$/, "");

    return c.json(
      {
        actionUrl: `${payUBaseUrl}/_payment`,
        fields: {
          key,
          txnid,
          amount: amountString,
          productinfo,
          firstname,
          email,
          phone,
          surl,
          furl,
          hash,
          udf1,
          service_provider: "payu_paisa",
        },
        successUrl: `${frontendBase}/?payment=success&gateway=payu&applicationId=${applicationId}`,
        failureUrl: `${frontendBase}/?payment=failure&gateway=payu&applicationId=${applicationId}`,
      },
      201
    );
  } catch (error) {
    console.error("/api/payments/payu/initiate error", error);
    return c.json({ message: "Unable to start PayU payment" }, 500);
  }
});

async function handlePayUCallback(c) {
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
  try {
    const method = c.req.method.toUpperCase();
    const payload = method === "GET" ? c.req.query() : Object.fromEntries(await c.req.formData());
    const txnid = String(payload.txnid || "").trim();
    const responseHash = String(payload.hash || "").trim().toLowerCase();
    const status = String(payload.status || "").trim().toLowerCase();

    const frontendBase = String(c.env.FRONTEND_BASE_URL || "https://internships.vyntyraconsultancyservices.in").replace(/\/+$/, "");

    if (!txnid) {
      return c.redirect(`${frontendBase}/?payment=failure&gateway=payu`);
    }

    const payment = await c.env.DB.prepare("SELECT id, application_id FROM payments WHERE payu_txn_id = ?")
      .bind(txnid)
      .first();

    if (!payment) {
      return c.redirect(`${frontendBase}/?payment=failure&gateway=payu`);
    }

    const key = String(c.env.PAYU_MERCHANT_KEY || "").trim();
    const salt = String(c.env.PAYU_MERCHANT_SALT || "").trim();
    const expectedHash = sha512(buildPayUResponseHashString(payload, salt, key)).toLowerCase();
    const isSuccess = Boolean(key && salt) && expectedHash === responseHash && status === "success";

    const amount = Number(payload.amount || 0);
    const methodMapped = mapPayUMethodToInternal(payload.mode);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE payments
         SET payu_payment_id = ?, payu_hash = ?, payu_unmapped_status = ?, amount = ?, method = ?, status = ?, timestamp = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        String(payload.mihpayid || "").trim() || null,
        responseHash || null,
        String(payload.unmappedstatus || "").trim() || null,
        Number.isFinite(amount) && amount > 0 ? amount : null,
        methodMapped,
        isSuccess ? "completed" : "failed",
        nowIso(),
        nowIso(),
        payment.id
      ),
      c.env.DB.prepare(
        `UPDATE applications
         SET status = ?, payment_id = ?, updated_at = ?
         WHERE id = ?`
      ).bind(isSuccess ? "COMPLETED_AND_PAID" : "FAILED", payment.id, nowIso(), payment.application_id),
    ]);

    const state = isSuccess ? "success" : "failure";
    return c.redirect(`${frontendBase}/?payment=${state}&gateway=payu&applicationId=${payment.application_id}`);
  } catch (error) {
    console.error("/api/payments/payu/callback error", error);
    const frontendBase = String(c.env.FRONTEND_BASE_URL || "https://internships.vyntyraconsultancyservices.in").replace(/\/+$/, "");
    return c.redirect(`${frontendBase}/?payment=failure&gateway=payu`);
  }
}

app.post("/api/payments/payu/callback", handlePayUCallback);
app.get("/api/payments/payu/callback", handlePayUCallback);

app.post("/api/payments/razorpay/webhook", async (c) => {
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
  try {
    const bodyText = await c.req.text();
    const signature = String(c.req.header("x-razorpay-signature") || "").trim();
    const secret = String(c.env.RAZORPAY_WEBHOOK_SECRET || c.env.RAZORPAY_KEY_SECRET || "").trim();

    if (!signature || !secret) {
      return c.json({ message: "Webhook signature setup missing" }, 400);
    }

    const expected = crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
    if (expected !== signature) {
      return c.json({ message: "Invalid webhook signature" }, 400);
    }

    const event = JSON.parse(bodyText);
    const eventType = String(event.event || "");

    if (eventType === "payment.captured") {
      const paymentEntity = event?.payload?.payment?.entity || {};
      const razorpayOrderId = String(paymentEntity.order_id || "").trim();
      const razorpayPaymentId = String(paymentEntity.id || "").trim();

      if (razorpayOrderId && razorpayPaymentId) {
        const payment = await c.env.DB.prepare("SELECT id, application_id FROM payments WHERE razorpay_order_id = ?")
          .bind(razorpayOrderId)
          .first();

        if (payment) {
          await c.env.DB.batch([
            c.env.DB.prepare(
              `UPDATE payments
               SET razorpay_payment_id = ?, method = ?, vpa = ?, card_last4 = ?, contact = ?, status = 'completed', timestamp = ?, updated_at = ?
               WHERE id = ?`
            ).bind(
              razorpayPaymentId,
              String(paymentEntity.method || "") || null,
              String(paymentEntity.vpa || "") || null,
              String(paymentEntity.card?.last4 || "") || null,
              String(paymentEntity.contact || "") || null,
              nowIso(),
              nowIso(),
              payment.id
            ),
            c.env.DB.prepare(
              `UPDATE applications
               SET status = 'COMPLETED_AND_PAID', payment_id = ?, updated_at = ?
               WHERE id = ?`
            ).bind(payment.id, nowIso(), payment.application_id),
          ]);
        }
      }
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("/api/payments/razorpay/webhook error", error);
    return c.json({ message: "Webhook processing failed" }, 500);
  }
});

app.post("/api/payments/payu/webhook", async (c) => {
  // PayU can post similar payloads to callback; reuse callback logic safely.
    if (!c.env.DB) return c.json({ message: "D1 binding DB is missing" }, 500);
  return handlePayUCallback(c);
});

app.notFound((c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/")) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.text("Not found", 404);
});

app.onError((err, c) => {
  console.error("Unhandled function error", err);
  return asJson({ message: "Internal server error" }, 500);
});

export const onRequest = (context) => {
  const url = new URL(context.request.url);
  const isApiRoute = url.pathname.startsWith("/api/");
  const isHealthRoute = url.pathname === "/health" || url.pathname === "/keep-alive";

  if (!isApiRoute && !isHealthRoute) {
    return context.next();
  }

  return app.fetch(context.request, context.env, context);
};
