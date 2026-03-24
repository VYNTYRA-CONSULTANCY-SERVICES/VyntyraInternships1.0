import { Router } from "express";
import crypto from "crypto";
import Application from "../models/Application.js";
import Payment from "../models/Payment.js";
import { getRazorpayClient } from "../config/razorpay.js";
import { publishJob } from "../services/rabbitmq.js";
import { handlePaymentSuccess } from "../jobs/handlers.js";

const router = Router();

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
    });

  } catch (error) {
    next(error);
  }
});

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

    // ✅ Trigger email + invoice (already handled in handler)
    try {
      await publishJob("payment-success", {
        applicationId: application._id.toString(),
        paymentId: payment._id.toString(),
      });
    } catch (queueError) {
      console.warn("Queue failed, running inline", queueError?.message);

      try {
        await handlePaymentSuccess({
          applicationId: application._id.toString(),
          paymentId: payment._id.toString(),
        });
      } catch (err) {
        console.warn("Inline handler failed", err?.message);
      }
    }

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