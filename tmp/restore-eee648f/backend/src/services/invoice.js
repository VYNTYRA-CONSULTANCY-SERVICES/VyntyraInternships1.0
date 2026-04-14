import PDFDocument from "pdfkit";

import Counter from "../models/Counter.js";
import Invoice from "../models/Invoice.js";
import { uploadBufferToS3 } from "./s3.js";

const COMPANY_WEBSITE = "https://vyntyraconsultancyservices.in";
const COMPANY_NAME = "Vyntyra Consultancy Services";

const getTransactionId = (payment) => {
  return payment.razorpayPaymentId || payment.payuPaymentId || payment.payuTxnId || "N/A";
};

const getNextInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const key = `invoice:${year}`;

  const counter = await Counter.findOneAndUpdate(
    { key },
    {
      $inc: { seq: 1 },
      $setOnInsert: { key, seq: 0, createdAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { new: true, upsert: true }
  );

  const sequence = String(counter.seq).padStart(5, "0");
  return `INV-${year}-${sequence}`;
};

const buildInvoiceBuffer = async ({ application, payment, invoiceNumber }) => {
  const doc = new PDFDocument({ margin: 40 });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  const logoUrl = process.env.COMPANY_LOGO_URL ?? `${COMPANY_WEBSITE}/assets/media/logo.png`;
  try {
    const logoResponse = await fetch(logoUrl);
    if (logoResponse.ok) {
      const logoArrayBuffer = await logoResponse.arrayBuffer();
      const logoBuffer = Buffer.from(logoArrayBuffer);
      doc.image(logoBuffer, 40, 30, { width: 120 });
    }
  } catch (error) {
    console.warn("Logo fetch skipped", error?.message);
  }

  doc.fontSize(20).text("INVOICE", 0, 45, { align: "right" });
  doc.fontSize(11).text(invoiceNumber, 0, 70, { align: "right" });

  doc.moveDown(4);
  doc.fontSize(12).text(COMPANY_NAME);
  doc.fontSize(10).fillColor("#555").text(COMPANY_WEBSITE).fillColor("#000");

  doc.moveDown();
  doc.fontSize(12).text("Bill To:");
  doc.fontSize(10).text(application.fullName);
  doc.text(application.email);
  doc.text(application.phone);

  doc.moveDown(2);
  doc.fontSize(12).text("Payment Details");
  doc.moveDown(0.5);

  const paymentMethod = payment.method ?? "N/A";
  const paidAt = payment.timestamp ? new Date(payment.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "N/A";
  const reference = payment.cardLast4 ? `Card ****${payment.cardLast4}` : payment.vpa ?? "N/A";

  doc.fontSize(10).text(`Transaction ID: ${getTransactionId(payment)}`);
  doc.text(`Payment Time (IST): ${paidAt}`);
  doc.text(`Method: ${paymentMethod}`);
  doc.text(`Reference: ${reference}`);
  doc.text(`Contact: ${payment.contact ?? "N/A"}`);

  doc.moveDown(2);
  doc.fontSize(12).text("Summary");
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Application Fee Paid: INR ${payment.amount}`);
  doc.text(`Currency: ${payment.currency}`);
  doc.text(`Registration ID: ${application.registrationId ?? "N/A"}`);
  doc.text(`Domain: ${application.preferredDomain ?? "N/A"}`);
  doc.text(`Duration: ${application.selectedDuration ?? "N/A"}`);
  doc.text(`Add-ons: ${application.selectedAddons ?? "None"}`);

  doc.moveDown(3);
  doc.fontSize(10).fillColor("#666").text("This is a system generated invoice and does not require signature.");

  doc.end();

  await new Promise((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  return Buffer.concat(chunks);
};

export const generateAndStoreInvoice = async ({ application, payment }) => {
  const existingInvoice = await Invoice.findOne({ applicationId: application._id });
  if (existingInvoice) {
    return existingInvoice;
  }

  const invoiceNumber = await getNextInvoiceNumber();
  const invoiceBuffer = await buildInvoiceBuffer({ application, payment, invoiceNumber });

  const key = `invoices/${invoiceNumber}.pdf`;
  const invoiceUrl = await uploadBufferToS3(invoiceBuffer, key, "application/pdf");

  return Invoice.create({
    applicationId: application._id,
    invoiceNumber,
    candidateName: application.fullName,
    candidateEmail: application.email,
    paymentDetails: {
      method: payment.method,
      timestamp: payment.timestamp,
      transactionId: getTransactionId(payment),
      last4OrVpa: payment.cardLast4 || payment.vpa,
      amount: payment.amount,
      currency: payment.currency,
    },
    invoiceUrl,
    status: "generated",
  });
};
