import fs from "node:fs/promises";
import path from "node:path";

import Application from "../models/Application.js";
import Payment from "../models/Payment.js";
import { sendConfirmationEmail, sendHRNotification, sendPaymentReminder, sendWeeklyReport } from "../services/email.js";
import { generatePaymentReceiptBuffer } from "../services/receipt.js";
import { generateWeeklyWorkbookBuffer } from "../services/reporting.js";
import { uploadToS3 } from "../services/s3.js";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

const resolveResumeAttachment = async (application) => {
  const preferredFilename = `${application.registrationId || String(application._id)}-resume.pdf`;

  if (application.resumePath) {
    const absoluteResumePath = path.resolve(process.cwd(), application.resumePath);
    try {
      await fs.access(absoluteResumePath);
      return {
        filename: preferredFilename,
        path: absoluteResumePath,
        contentType: "application/pdf",
      };
    } catch {
      // Continue to URL fallback.
    }
  }

  const resumeUrl = String(application.resumeUrl || "").trim();
  if (!resumeUrl) {
    return null;
  }

  if (isHttpUrl(resumeUrl)) {
    return {
      filename: preferredFilename,
      href: resumeUrl,
      contentType: "application/pdf",
    };
  }

  if (resumeUrl.startsWith("/uploads/")) {
    const localFilePath = path.resolve(process.cwd(), "uploads", path.basename(resumeUrl));
    try {
      await fs.access(localFilePath);
      return {
        filename: preferredFilename,
        path: localFilePath,
        contentType: "application/pdf",
      };
    } catch {
      return null;
    }
  }

  return null;
};

const getTransactionId = (payment) => {
  return payment.razorpayPaymentId || payment.payuPaymentId || payment.payuTxnId || "N/A";
};

export const handlePaymentSuccess = async ({ applicationId, paymentId }) => {
  const application = await Application.findById(applicationId);
  const payment = await Payment.findById(paymentId);

  if (!application || !payment) {
    throw new Error("Application or payment missing for payment-success job");
  }

  const receiptBuffer = await generatePaymentReceiptBuffer({ application, payment });
  const resumeAttachment = await resolveResumeAttachment(application);
  const paymentDetails = {
    method: payment.method,
    timestamp: payment.timestamp,
    transactionId: getTransactionId(payment),
    last4OrVpa: payment.cardLast4 || payment.vpa,
    amount: payment.amount,
    currency: payment.currency,
  };

  await sendConfirmationEmail(
    application.email,
    application.fullName,
    paymentDetails,
    {
      registrationId: application.registrationId,
      receiptBuffer,
      resumeAttachment,
      resumeUrl: application.resumeUrl,
      applicationDetails: {
        phone: application.phone,
        preferredDomain: application.preferredDomain,
        selectedDuration: application.selectedDuration,
        selectedAddons: application.selectedAddons,
      },
    }
  );

  await sendHRNotification(
    application.fullName,
    application.email,
    {
      ...application.toObject(),
      amount: payment.amount,
      paymentMethod: payment.method,
      transactionId: getTransactionId(payment),
    }
  );
};

export const handleResumeUpload = async ({ applicationId, localResumePath, originalName }) => {
  if (!localResumePath) {
    return;
  }

  const absolutePath = path.resolve(process.cwd(), localResumePath);
  const safeName = String(originalName || "resume.pdf").replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `resumes/${applicationId}-${safeName}`;

  try {
    const resumeUrl = await uploadToS3(absolutePath, key, "application/pdf");

    await Application.findByIdAndUpdate(applicationId, {
      resumeUrl,
      resumePath: localResumePath,
    });

    await fs.unlink(absolutePath).catch(() => undefined);
  } catch (error) {
    console.warn("S3 unavailable, keeping resume on local storage", error?.message);
    await Application.findByIdAndUpdate(applicationId, {
      resumePath: localResumePath,
      resumeUrl: `/uploads/${path.basename(localResumePath)}`,
    });
  }
};

export const handlePaymentReminder = async ({ applicationId }) => {
  const application = await Application.findById(applicationId);

  if (!application || application.status !== "PENDING_PAYMENT") {
    return;
  }

  const now = new Date();
  if (application.lastReminderSentAt) {
    const msDiff = now.getTime() - new Date(application.lastReminderSentAt).getTime();
    if (msDiff < 24 * 60 * 60 * 1000) {
      return;
    }
  }

  await sendPaymentReminder(application.email, application.fullName);

  application.numReminders += 1;
  application.lastReminderSentAt = now;
  await application.save();
};

export const handleWeeklyReport = async () => {
  const workbookBuffer = await generateWeeklyWorkbookBuffer();
  await sendWeeklyReport(workbookBuffer);
};

export const jobHandlers = {
  "payment-success": handlePaymentSuccess,
  "resume-upload": handleResumeUpload,
  "payment-reminder": handlePaymentReminder,
  "weekly-report": handleWeeklyReport,
};
