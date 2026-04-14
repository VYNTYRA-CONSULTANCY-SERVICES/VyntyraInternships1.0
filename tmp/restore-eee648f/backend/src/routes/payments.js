import { Router } from "express";
import crypto from "crypto";
import Application from "../models/Application.js";
import Payment from "../models/Payment.js";
import { getRazorpayClient } from "../config/razorpay.js";
import { handlePaymentSuccess } from "../jobs/handlers.js";

const router = Router();

const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || "https://internships.vyntyraconsultancyservices.in")
  .replace(/\/+$/, "");
const PAYMENT_SUCCESS_URL = process.env.PAYMENT_SUCCESS_URL || `${FRONTEND_BASE_URL}/?payment=success`;
const PAYMENT_FAILURE_URL = process.env.PAYMENT_FAILURE_URL || `${FRONTEND_BASE_URL}/?payment=failure`;
const BACKEND_BASE_URL = (process.env.BACKEND_BASE_URL || "https://vyntyrainternships-backend.onrender.com")
  .replace(/\/+$/, "");
const enablePaymentTimingLogs = String(process.env.ENABLE_REQUEST_TIMING_LOGS ?? "false").toLowerCase() === "true";
const TEST_DOMAIN = "test";

const toTwoDecimals = (value) => Number(value).toFixed(2);
const sha512 = (value) => crypto.createHash("sha512").update(value).digest("hex");
const nowNs = () => process.hrtime.bigint();
const elapsedMs = (startNs) => Number(nowNs() - startNs) / 1e6;

const logPaymentTiming = (label, metadata = {}) => {
  if (!enablePaymentTimingLogs) {
    return;
  }

  const metadataString = Object.entries(metadata)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[payment-timing] ${label}${metadataString ? ` ${metadataString}` : ""}`);
};

const resolveFeeAmount = (application, requestedAmount) => {
  const preferredDomain = String(application?.preferredDomain || "").trim().toLowerCase();
  if (preferredDomain === TEST_DOMAIN) {
    return 1;
  }

  const normalized = Number(requestedAmount ?? process.env.APPLICATION_FEE_INR ?? 499);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
};

const getPayURequiredConfig = () => {
  const merchantKey = String(process.env.PAYU_MERCHANT_KEY || "").trim();
  const merchantSalt = String(process.env.PAYU_MERCHANT_SALT || "").trim();
  const payUBaseUrl = (process.env.PAYU_BASE_URL || "https://secure.payu.in").replace(/\/+$/, "");

  if (!merchantKey || !merchantSalt) {
    const error = new Error("PayU credentials are missing. Set PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT.");
    error.statusCode = 500;
    throw error;
  }

  return {
    key: merchantKey,
    salt: merchantSalt,
    actionUrl: `${payUBaseUrl}/_payment`,
  };
};

const mapPayUMethodToInternal = (mode) => {
  const normalized = String(mode || "").toLowerCase();
  if (normalized.includes("upi")) return "upi";
  if (normalized.includes("card")) return "card";
  if (normalized.includes("nb") || normalized.includes("netbanking")) return "netbanking";
  if (normalized.includes("wallet")) return "wallet";
  return null;
};

const mapRazorpayMethodToInternal = (method) => {
  const normalized = String(method || "").toLowerCase();
  if (normalized.includes("upi")) return "upi";
  if (normalized.includes("card")) return "card";
  if (normalized.includes("netbanking")) return "netbanking";
  if (normalized.includes("wallet")) return "wallet";
  return null;
};

const buildPayUResponseHashString = (payload, salt, key) => {
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
};

// runPostPaymentWorkflow removed: all post-payment actions now run inline

/**
 * POST /api/payments/create-order
 * Create a Razorpay order for the application fee
 * Body: { applicationId, amount }
 */
router.post("/create-order", async (req, res, next) => {
  const routeStartNs = nowNs();
  try {
    const razorpay = getRazorpayClient();
    const { applicationId, amount } = req.body;

    if (!applicationId) {
      return res.status(400).json({ message: "Missing applicationId or valid amount" });
    }

    const application = await Application.findById(applicationId)
      .select("_id status email fullName preferredDomain")
      .lean();
    const lookupDoneNs = nowNs();
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.status !== "PENDING_PAYMENT") {
      return res.status(400).json({ message: "Application already processed" });
    }

    const feeAmount = resolveFeeAmount(application, amount);
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
      return res.status(400).json({ message: "Missing applicationId or valid amount" });
    }

    let order;
    try {
      order = await razorpay.orders.create({
        amount: Math.round(feeAmount * 100), // Razorpay expects paise
        currency: "INR",
        receipt: `app_${applicationId}`,
        notes: {
          applicationId: applicationId.toString(),
          email: application.email,
          fullName: application.fullName,
        },
      });
      const orderDoneNs = nowNs();

      // Create or update payment record
      const payment = await Payment.findOneAndUpdate(
        { applicationId },
        {
          $set: {
            gateway: "razorpay",
            razorpayOrderId: order.id,
            amount: feeAmount,
            currency: "INR",
            status: "pending",
            updatedAt: new Date(),
          },
          $setOnInsert: {
            applicationId,
            createdAt: new Date(),
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );
      const dbUpsertDoneNs = nowNs();

      logPaymentTiming("create-order", {
        applicationId,
        appLookupMs: elapsedMs(routeStartNs).toFixed(2),
        razorpayOrderMs: (Number(orderDoneNs - lookupDoneNs) / 1e6).toFixed(2),
        dbUpsertMs: (Number(dbUpsertDoneNs - orderDoneNs) / 1e6).toFixed(2),
        totalMs: elapsedMs(routeStartNs).toFixed(2),
      });

      return res.status(201).json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment._id,
        successUrl: PAYMENT_SUCCESS_URL,
        failureUrl: PAYMENT_FAILURE_URL,
      });
    } catch (rzpError) {
      const description = rzpError?.error?.description || rzpError?.message;
      if (rzpError?.statusCode === 401 || /auth/i.test(String(description || ""))) {
        const error = new Error("Razorpay authentication failed. Please verify KEY_ID and KEY_SECRET.");
        error.statusCode = 502;
        throw error;
      }
      throw rzpError;
    }

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/payu/initiate
 * Initiate PayU hosted checkout.
 * Body: { applicationId, amount }
 */
router.post("/payu/initiate", async (req, res, next) => {
  const routeStartNs = nowNs();
  try {
    const { key, salt, actionUrl } = getPayURequiredConfig();
    const { applicationId, amount } = req.body;

    if (!applicationId) {
      return res.status(400).json({ message: "Missing applicationId or valid amount" });
    }

    const application = await Application.findById(applicationId)
      .select("_id status email fullName phone preferredDomain")
      .lean();
    const lookupDoneNs = nowNs();
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.status !== "PENDING_PAYMENT") {
      return res.status(400).json({ message: "Application already processed" });
    }

    const feeAmount = resolveFeeAmount(application, amount);
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
      return res.status(400).json({ message: "Missing applicationId or valid amount" });
    }

    const amountString = toTwoDecimals(feeAmount);
    const txnid = `v${Date.now()}${String(application._id).slice(-8)}`;
    const productinfo = "Vyntyra Internship Registration Fee";
    const firstname = String(application.fullName || "Candidate").trim().slice(0, 60);
    const email = String(application.email || "").trim();
    const phone = String(application.phone || "").trim();
    const surl = `${BACKEND_BASE_URL}/api/payments/payu/callback`;
    const furl = `${BACKEND_BASE_URL}/api/payments/payu/callback`;

    const udf1 = String(application._id);
    const udf2 = "";
    const udf3 = "";
    const udf4 = "";
    const udf5 = "";
    const udf6 = "";
    const udf7 = "";
    const udf8 = "";
    const udf9 = "";
    const udf10 = "";

    // Hash must match exactly with posted fields order expected by PayU.
    const hashString = `${key}|${txnid}|${amountString}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}|${udf6}|${udf7}|${udf8}|${udf9}|${udf10}|${salt}`;
    const hash = sha512(hashString);

    await Payment.findOneAndUpdate(
      { applicationId },
      {
        $set: {
          gateway: "payu",
          payuTxnId: txnid,
          amount: feeAmount,
          currency: "INR",
          status: "pending",
          updatedAt: new Date(),
        },
        $setOnInsert: {
          applicationId,
          createdAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );
    const upsertDoneNs = nowNs();

    logPaymentTiming("payu-initiate", {
      applicationId,
      appLookupMs: (Number(lookupDoneNs - routeStartNs) / 1e6).toFixed(2),
      dbUpsertMs: (Number(upsertDoneNs - lookupDoneNs) / 1e6).toFixed(2),
      totalMs: elapsedMs(routeStartNs).toFixed(2),
    });

    return res.status(201).json({
      actionUrl,
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
      successUrl: `${PAYMENT_SUCCESS_URL}&gateway=payu&applicationId=${application._id}`,
      failureUrl: `${PAYMENT_FAILURE_URL}&gateway=payu&applicationId=${application._id}`,
    });
  } catch (error) {
    next(error);
  }
});

const handlePayUCallback = async (req, res, next) => {
  const routeStartNs = nowNs();
  try {
    const { key, salt } = getPayURequiredConfig();
    const payload = { ...req.query, ...req.body };
    const txnid = String(payload.txnid || "").trim();
    const responseHash = String(payload.hash || "").trim().toLowerCase();
    const status = String(payload.status || "").trim().toLowerCase();
    const amount = Number(payload.amount || 0);
    const gateway = "payu";

    if (!txnid) {
      return res.redirect(`${PAYMENT_FAILURE_URL}&gateway=${gateway}`);
    }

    const expectedHash = sha512(buildPayUResponseHashString(payload, salt, key)).toLowerCase();
    const isHashValid = expectedHash === responseHash;

    const payment = await Payment.findOne({ payuTxnId: txnid });
    if (!payment) {
      return res.redirect(`${PAYMENT_FAILURE_URL}&gateway=${gateway}`);
    }
    const paymentLookupDoneNs = nowNs();

    const isSuccess = isHashValid && status === "success";

    payment.gateway = "payu";
    payment.payuPaymentId = String(payload.mihpayid || "").trim() || undefined;
    payment.payuHash = responseHash || undefined;
    payment.payuUnmappedStatus = String(payload.unmappedstatus || "").trim() || undefined;
    payment.amount = Number.isFinite(amount) && amount > 0 ? amount : payment.amount;
    payment.method = mapPayUMethodToInternal(payload.mode);
    payment.status = isSuccess ? "completed" : "failed";
    payment.timestamp = new Date();
    await payment.save();
    const paymentSaveDoneNs = nowNs();

    if (isSuccess) {
      const application = await Application.findByIdAndUpdate(
        payment.applicationId,
        {
          status: "COMPLETED_AND_PAID",
          paymentId: payment._id,
        },
        { new: true }
      );

      if (application) {
        // Directly handle payment success inline (no queue)
        try {
          await handlePaymentSuccess({
            applicationId: application._id,
            paymentId: payment._id,
          });
        } catch (workflowError) {
          console.warn("PayU post-payment workflow failed", workflowError?.message);
        }
      }
    }

    const redirectBase = isSuccess ? PAYMENT_SUCCESS_URL : PAYMENT_FAILURE_URL;
    logPaymentTiming("payu-callback", {
      txnid,
      isSuccess,
      paymentLookupMs: (Number(paymentLookupDoneNs - routeStartNs) / 1e6).toFixed(2),
      paymentSaveMs: (Number(paymentSaveDoneNs - paymentLookupDoneNs) / 1e6).toFixed(2),
      totalMs: elapsedMs(routeStartNs).toFixed(2),
    });
    return res.redirect(`${redirectBase}&gateway=${gateway}&applicationId=${payment.applicationId}`);
  } catch (error) {
    next(error);
  }
};

router.post("/payu/callback", handlePayUCallback);
router.get("/payu/callback", handlePayUCallback);

/**
 * POST /api/payments/verify
 * Verify Razorpay payment signature
 * Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
router.post("/verify", async (req, res, next) => {
  const routeStartNs = nowNs();
  try {
    const razorpay = getRazorpayClient();
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    // Verify signature quickly
    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        message: "Payment verification failed: Invalid signature",
      });
    }

    // Find payment record immediately and return success
    const payment = await Payment.findOne({ razorpayOrderId });
    const paymentLookupDoneNs = nowNs();
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    // Update payment and application in parallel (don't wait for both)
    const updatePaymentPromise = Payment.findOneAndUpdate(
      { razorpayOrderId },
      {
        razorpayPaymentId,
        razorpaySignature,
        status: "completed",
        timestamp: new Date(),
      },
      { new: true }
    );

    const updateApplicationPromise = Application.findByIdAndUpdate(
      payment.applicationId,
      {
        status: "COMPLETED_AND_PAID",
        paymentId: payment._id,
      },
      { new: true }
    );

    // Fetch payment details from Razorpay without blocking response
    const fetchCardPromise = razorpay.payments
      .fetch(razorpayPaymentId)
      .then(async (paymentDetails) => {
        let cardLast4 = null;
        if (paymentDetails.card_id) {
          try {
            const cardDetails = await razorpay.cards.fetch(paymentDetails.card_id);
            cardLast4 = cardDetails?.last4 ?? null;
          } catch (error) {
            console.warn("Unable to fetch card details", error?.message);
          }
        }
        return { paymentDetails, cardLast4 };
      })
      .catch(error => {
        console.warn("Unable to fetch Razorpay payment details", error?.message);
        return null;
      });

    // Return success immediately while other operations continue
    const [updatedPayment, updatedApplication] = await Promise.all([
      updatePaymentPromise,
      updateApplicationPromise,
    ]);
    const dbUpdateDoneNs = nowNs();

    res.json({
      message: "Payment verified successfully",
      applicationId: updatedApplication._id,
      status: updatedApplication.status,
    });

    logPaymentTiming("verify", {
      orderId: razorpayOrderId,
      paymentLookupMs: (Number(paymentLookupDoneNs - routeStartNs) / 1e6).toFixed(2),
      dbUpdateMs: (Number(dbUpdateDoneNs - paymentLookupDoneNs) / 1e6).toFixed(2),
      responseMs: elapsedMs(routeStartNs).toFixed(2),
    });

    // Continue with additional updates asynchronously (non-blocking)
    fetchCardPromise.then(async (result) => {
      if (result) {
        const { paymentDetails, cardLast4 } = result;
        try {
          await Payment.findOneAndUpdate(
            { razorpayOrderId },
            {
              method: mapRazorpayMethodToInternal(paymentDetails.method),
              vpa: paymentDetails.vpa || null,
              cardLast4,
              contact: paymentDetails.contact || null,
            }
          );
        } catch (error) {
          console.warn("Failed to update payment additional details", error?.message);
        }
      }
      // Run post-payment workflow inline (no queue)
      try {
        await handlePaymentSuccess({
          applicationId: updatedApplication._id,
          paymentId: updatedPayment._id,
        });
      } catch (error) {
        console.warn("Post-payment workflow failed", error?.message);
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;