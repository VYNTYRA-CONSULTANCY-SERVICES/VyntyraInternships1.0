import XLSX from "xlsx";

import Application from "../models/Application.js";
import Payment from "../models/Payment.js";

export const generateWeeklyWorkbookBuffer = async () => {
  const applications = await Application.find({}).sort({ createdAt: 1 }).lean();

  const applicationIds = applications.map((item) => item._id);
  const payments = await Payment.find({ applicationId: { $in: applicationIds } }).lean();

  const paymentByApplicationId = new Map(
    payments.map((payment) => [String(payment.applicationId), payment])
  );

  const rows = applications.map((app) => {
    const payment = paymentByApplicationId.get(String(app._id));
    return {
      application_id: String(app._id),
      full_name: app.fullName,
      email: app.email,
      phone: app.phone,
      college_name: app.collegeName,
      college_location: app.collegeLocation,
      preferred_domain: app.preferredDomain,
      languages: app.languages,
      remote_comfort: app.remoteComfort,
      placement_contact: app.placementContact,
      resume_url: app.resumeUrl || "",
      application_status: app.status,
      created_at: app.createdAt,
      payment_status: payment?.status || "not_created",
      payment_amount: payment?.amount || "",
      payment_currency: payment?.currency || "",
      payment_method: payment?.method || "",
      payment_vpa: payment?.vpa || "",
      payment_card_last4: payment?.cardLast4 || "",
      payment_contact: payment?.contact || "",
      payment_timestamp: payment?.timestamp || "",
      razorpay_order_id: payment?.razorpayOrderId || "",
      razorpay_payment_id: payment?.razorpayPaymentId || "",
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Applications");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};
