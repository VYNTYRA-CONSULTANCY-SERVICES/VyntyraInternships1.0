import PDFDocument from "pdfkit";

const COMPANY_NAME = "Vyntyra Consultancy Services";

const buildReference = (payment) => {
  if (payment.cardLast4) {
    return `Card ****${payment.cardLast4}`;
  }
  if (payment.vpa) {
    return payment.vpa;
  }
  return "N/A";
};

const buildTransactionId = (payment) => {
  return payment.razorpayPaymentId || payment.payuPaymentId || payment.payuTxnId || "N/A";
};

export const generatePaymentReceiptBuffer = async ({ application, payment }) => {
  const doc = new PDFDocument({ margin: 40 });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  doc.fontSize(20).text("PAYMENT RECEIPT", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(12).text(COMPANY_NAME, { align: "center" });

  doc.moveDown(2);
  doc.fontSize(12).text("Applicant Details");
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Name: ${application.fullName}`);
  doc.text(`Phone: ${application.phone}`);
  doc.text(`Email: ${application.email}`);
  doc.text(`Registration ID: ${application.registrationId || "N/A"}`);
  doc.text(`Domain: ${application.preferredDomain || "N/A"}`);
  doc.text(`Duration: ${application.selectedDuration || "N/A"}`);
  doc.text(`Add-ons: ${application.selectedAddons || "None"}`);

  doc.moveDown(1.5);
  doc.fontSize(12).text("Payment Details");
  doc.moveDown(0.5);

  const paidAt = payment.timestamp
    ? new Date(payment.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "N/A";

  doc.fontSize(10).text(`Gateway: ${payment.gateway || "N/A"}`);
  doc.text(`Payment Method: ${payment.method || "N/A"}`);
  doc.text(`Amount Paid: INR ${Number(payment.amount || 0).toFixed(2)}`);
  doc.text(`Currency: ${payment.currency || "INR"}`);
  doc.text(`Transaction ID: ${buildTransactionId(payment)}`);
  doc.text(`Payment Time (IST): ${paidAt}`);
  doc.text(`Payer Contact: ${payment.contact || application.phone || "N/A"}`);
  doc.text(`Payment Reference: ${buildReference(payment)}`);

  doc.moveDown(2);
  doc.fontSize(9).fillColor("#666").text("This is a system-generated receipt and does not require a signature.", {
    align: "left",
  });

  doc.end();

  await new Promise((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  return Buffer.concat(chunks);
};

export default generatePaymentReceiptBuffer;
