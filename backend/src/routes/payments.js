import { Router } from "express";
import crypto from "crypto";
import Application from "../models/Application.js";
import Payment from "../models/Payment.js";
import { getRazorpayClient } from "../config/razorpay.js";
import { publishJob } from "../services/rabbitmq.js";
import { handlePaymentSuccess } from "../jobs/handlers.js";

const router = Router();

const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || "https://internships.vyntyraconsultancyservices.in")
  .replace(/\/+$/, "");
const PAYMENT_SUCCESS_URL = process.env.PAYMENT_SUCCESS_URL || `${FRONTEND_BASE_URL}/?payment=success`;
const PAYMENT_FAILURE_URL = process.env.PAYMENT_FAILURE_URL || `${FRONTEND_BASE_URL}/?payment=failure`;
const BACKEND_BASE_URL = (process.env.BACKEND_BASE_URL || "https://vyntyrainternships-backend.onrender.com")
  .replace(/\/+$/, "");

const toTwoDecimals = (value) => Number(value).toFixed(2);
const sha512 = (value) => crypto.createHash("sha512").update(value).digest("hex");

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

const runPostPaymentWorkflow = async ({ paymentId, applicationId }) => {
  try {
    await publishJob("payment-success", {
      applicationId: applicationId.toString(),
      paymentId: paymentId.toString(),
    });
  } catch (queueError) {
    console.warn("Queue failed, running inline", queueError?.message);
    try {
      await handlePaymentSuccess({
        applicationId: applicationId.toString(),
        paymentId: paymentId.toString(),
      });
    } catch (err) {
      console.warn("Inline handler failed", err?.message);
    }
  }
};

/**
 * POST /api/payments/create-order
 * Create a Razorpay order for the application fee
 * Body: { applicationId, amount }
 */
router.post("/create-order", async (req, res, next) => {
  try {
    const razorpay = getRazorpayClient();
    const { applicationId, amount } = req.body;
    const feeAmount = Number(amount ?? process.env.APPLICATION_FEE_INR ?? 499);

    if (!applicationId || !Number.isFinite(feeAmount) || feeAmount <= 0) {
      return res.status(400).json({ message: "Missing applicationId or valid amount" });
    }

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.status !== "PENDING_PAYMENT") {
      return res.status(400).json({ message: "Application already processed" });
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
    } catch (rzpError) {
      const description = rzpError?.error?.description || rzpError?.message;
      if (rzpError?.statusCode === 401 || /auth/i.test(String(description || ""))) {
        const error = new Error("Razorpay authentication failed. Please verify KEY_ID and KEY_SECRET.");
        error.statusCode = 502;
        throw error;
      }
      throw rzpError;
    }

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

    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      paymentId: payment._id,
      successUrl: PAYMENT_SUCCESS_URL,
      failureUrl: PAYMENT_FAILURE_URL,
    });

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
  try {
    const { key, salt, actionUrl } = getPayURequiredConfig();
    const { applicationId, amount } = req.body;
    const feeAmount = Number(amount ?? process.env.APPLICATION_FEE_INR ?? 499);

    if (!applicationId || !Number.isFinite(feeAmount) || feeAmount <= 0) {
      return res.status(400).json({ message: "Missing applicationId or valid amount" });
    }

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.status !== "PENDING_PAYMENT") {
      return res.status(400).json({ message: "Application already processed" });
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
        await runPostPaymentWorkflow({
          applicationId: application._id,
          paymentId: payment._id,
        });
      }
    }

    const redirectBase = isSuccess ? PAYMENT_SUCCESS_URL : PAYMENT_FAILURE_URL;
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
  try {
    const razorpay = getRazorpayClient();
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    // ✅ Verify signature
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

    // ✅ Fetch payment details from Razorpay
    const paymentDetails = await razorpay.payments.fetch(razorpayPaymentId);

    let cardLast4 = null;
    if (paymentDetails.card_id) {
      try {
        const cardDetails = await razorpay.cards.fetch(paymentDetails.card_id);
        cardLast4 = cardDetails?.last4 ?? null;
      } catch (error) {
        console.warn("Unable to fetch card details", error?.message);
      }
    }

    // ✅ Update Payment DB
    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId },
      {
        razorpayPaymentId,
        razorpaySignature,
        status: "completed",
        method: paymentDetails.method || null,
        vpa: paymentDetails.vpa || null,
        cardLast4,
        contact: paymentDetails.contact || null,
        timestamp: new Date(paymentDetails.created_at * 1000),
      },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    // ✅ Update Application
    const application = await Application.findByIdAndUpdate(
      payment.applicationId,
      {
        status: "COMPLETED_AND_PAID",
        paymentId: payment._id,
      },
      { new: true }
    );

    await runPostPaymentWorkflow({
      applicationId: application._id,
      paymentId: payment._id,
    });

    return res.json({
      message: "Payment verified successfully",
      applicationId: application._id,
      status: application.status,
    });

  } catch (error) {
    next(error);
  }
});

export default router;