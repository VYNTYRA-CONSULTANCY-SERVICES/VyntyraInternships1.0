import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export const generateInvoice = (data) => {
  const filePath = path.join("uploads", `invoice-${Date.now()}.pdf`);

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(20).text("Vyntyra Consultancy Services", { align: "center" });
  doc.moveDown();

  doc.fontSize(14).text(`Invoice`);
  doc.text(`Name: ${data.name}`);
  doc.text(`Email: ${data.email}`);
  doc.text(`Amount Paid: ₹${data.amount}`);
  doc.text(`Payment ID: ${data.paymentId}`);
  doc.text(`Date: ${new Date().toLocaleDateString()}`);

  doc.end();

  return filePath;
};