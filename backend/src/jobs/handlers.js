import fs from "node:fs/promises";
import path from "node:path";

import Application from "../models/Application.js";
import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import { sendConfirmationEmail, sendHRNotification, sendPaymentReminder, sendWeeklyReport } from "../services/email.js";
import { generateAndStoreInvoice } from "../services/invoice.js";
import { generateWeeklyWorkbookBuffer } from "../services/reporting.js";
import { uploadToS3 } from "../services/s3.js";

export const handlePaymentSuccess = async ({ applicationId, paymentId }) => {
  const application = await Application.findById(applicationId);
  const payment = await Payment.findById(paymentId);

  if (!application || !payment) {
    throw new Error("Application or payment missing for payment-success job");
  }

  const invoice = await generateAndStoreInvoice({ application, payment });

  if (!application.invoiceId) {
    application.invoiceId = invoice._id;
    await application.save();
  }

  await sendConfirmationEmail(
    application.email,
    application.fullName,
    {
      method: payment.method,
      timestamp: payment.timestamp,
      transactionId: payment.razorpayPaymentId,
      last4OrVpa: payment.cardLast4 || payment.vpa,
      amount: payment.amount,
    },
    invoice.invoiceUrl
  );

  await sendHRNotification(
    application.fullName,
    application.email,
    {
      ...application.toObject(),
      amount: payment.amount,
      paymentMethod: payment.method,
      transactionId: payment.razorpayPaymentId,
    },
    invoice.invoiceUrl
  );

  await Invoice.findByIdAndUpdate(invoice._id, { status: "sent" });
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
