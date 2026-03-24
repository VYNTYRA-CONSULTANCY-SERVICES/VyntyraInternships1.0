import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send confirmation email to candidate with invoice
 * @param {string} candidateEmail - Candidate email
 * @param {string} candidateName - Candidate name
 * @param {object} paymentDetails - Payment details
 * @param {string} invoiceUrl - URL to the invoice PDF
 */
export const sendConfirmationEmail = async (
  candidateEmail,
  candidateName,
  paymentDetails,
  invoiceUrl
) => {
  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #004085; color: white; padding: 20px; text-align: center; }
          .content { margin: 20px 0; }
          .details { background-color: #f5f5f5; padding: 15px; border-left: 4px solid #004085; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Confirmed! 🎉</h1>
          </div>
          <div class="content">
            <p>Hi ${candidateName},</p>
            <p>Thank you for submitting your internship application. Your payment has been confirmed and we are reviewing your profile.</p>
            
            <div class="details">
              <h3>Payment Details:</h3>
              <p><strong>Payment Method:</strong> ${paymentDetails.method || "N/A"}</p>
              <p><strong>Amount Paid:</strong> ₹${paymentDetails.amount}</p>
              <p><strong>Date & Time:</strong> ${new Date(paymentDetails.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
              <p><strong>Transaction ID:</strong> ${paymentDetails.transactionId}</p>
              ${paymentDetails.last4OrVpa ? `<p><strong>Payment Reference:</strong> ${paymentDetails.last4OrVpa}</p>` : ""}
            </div>
            
            <p>Your invoice has been attached to this email. You can also access it here: <a href="${invoiceUrl}">Download Invoice</a></p>
            
            <p>We will review your application and get back to you within 5 working days. Keep an eye on your inbox!</p>
            
            <p>
              Best regards,<br>
              <strong>Vyntyra Consultancy Services</strong><br>
              <a href="https://vyntyraconsultancyservices.in">https://vyntyraconsultancyservices.in</a>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: candidateEmail,
      subject: "Application Confirmation - Vyntyra Internship Program",
      html,
      attachments: [
        {
          filename: "invoice.pdf",
          href: invoiceUrl,
        },
      ],
    });
    console.log(`Confirmation email sent to ${candidateEmail}`);
  } catch (error) {
    console.error(`Failed to send confirmation email to ${candidateEmail}:`, error);
    throw error;
  }
};

/**
 * Send HR notification with candidate details
 * @param {string} candidateName - Candidate name
 * @param {string} candidateEmail - Candidate email
 * @param {object} applicationDetails - Application details
 * @param {string} invoiceUrl - URL to the invoice PDF
 */
export const sendHRNotification = async (
  candidateName,
  candidateEmail,
  applicationDetails,
  invoiceUrl
) => {
  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 700px; margin: 0 auto; padding: 20px; }
          .header { background-color: #004085; color: white; padding: 20px; text-align: center; }
          .details { margin: 20px 0; }
          .details-table { width: 100%; border-collapse: collapse; }
          .details-table td { padding: 10px; border-bottom: 1px solid #ddd; }
          .details-table td:first-child { font-weight: bold; width: 200px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Application Received</h1>
          </div>
          <div class="details">
            <h3>Candidate Information:</h3>
            <table class="details-table">
              <tr><td>Full Name:</td><td>${candidateName}</td></tr>
              <tr><td>Email:</td><td>${candidateEmail}</td></tr>
              <tr><td>Phone:</td><td>${applicationDetails.phone || "N/A"}</td></tr>
              <tr><td>College:</td><td>${applicationDetails.collegeName || "N/A"}</td></tr>
              <tr><td>Location:</td><td>${applicationDetails.collegeLocation || "N/A"}</td></tr>
              <tr><td>Preferred Domain:</td><td>${applicationDetails.preferredDomain || "N/A"}</td></tr>
              <tr><td>Languages:</td><td>${applicationDetails.languages || "N/A"}</td></tr>
              <tr><td>Remote Comfort:</td><td>${applicationDetails.remoteComfort || "N/A"}</td></tr>
            </table>
            
            <h3 style="margin-top: 20px;">Payment Details:</h3>
            <table class="details-table">
              <tr><td>Payment Status:</td><td>COMPLETED</td></tr>
              <tr><td>Amount:</td><td>₹${applicationDetails.amount}</td></tr>
              <tr><td>Payment Method:</td><td>${applicationDetails.paymentMethod || "N/A"}</td></tr>
              <tr><td>Transaction ID:</td><td>${applicationDetails.transactionId || "N/A"}</td></tr>
            </table>
            
            <p><strong>Invoice:</strong> <a href="${invoiceUrl}">Download Invoice</a></p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: "hr@vyntyraconsultancyservices.in",
      subject: `New Application: ${candidateName}`,
      html,
      attachments: [
        {
          filename: "invoice.pdf",
          href: invoiceUrl,
        },
      ],
    });
    console.log(`HR notification sent for ${candidateName}`);
  } catch (error) {
    console.error(`Failed to send HR notification:`, error);
    throw error;
  }
};

/**
 * Send payment reminder to candidate
 * @param {string} candidateEmail - Candidate email
 * @param {string} candidateName - Candidate name
 */
export const sendPaymentReminder = async (candidateEmail, candidateName) => {
  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ff9800; color: white; padding: 20px; text-align: center; }
          .content { margin: 20px 0; }
          .warning { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ff9800; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Reminder ⏰</h1>
          </div>
          <div class="content">
            <p>Hi ${candidateName},</p>
            
            <div class="warning">
              <p><strong>⚠️ Your payment is still pending!</strong></p>
              <p>We haven't received your payment yet. To secure your slot in the Vyntyra Internship Program, please complete your payment as soon as possible.</p>
            </div>
            
            <p>Your application is on hold until payment is confirmed. Once you complete the payment, we'll proceed with reviewing your profile.</p>
            
            <p style="margin: 20px 0; text-align: center;">
              <a href="https://vyntyraconsultancyservices.in/apply" style="background-color: #004085; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Complete Payment Now</a>
            </p>
            
            <p>If you have any questions or need assistance, please reach out to us at <a href="mailto:internshipsupport@vyntyraconsultancyservices.in">internshipsupport@vyntyraconsultancyservices.in</a></p>
            
            <p>
              Best regards,<br>
              <strong>Vyntyra Consultancy Services</strong><br>
              <a href="https://vyntyraconsultancyservices.in">https://vyntyraconsultancyservices.in</a>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: candidateEmail,
      subject: "Payment Reminder - Complete Your Application Now!",
      html,
    });
    console.log(`Payment reminder sent to ${candidateEmail}`);
  } catch (error) {
    console.error(`Failed to send payment reminder to ${candidateEmail}:`, error);
    throw error;
  }
};

/**
 * Send weekly report email with Excel attachment
 * @param {Buffer} excelBuffer - Excel file buffer
 */
export const sendWeeklyReport = async (excelBuffer) => {
  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #004085; color: white; padding: 20px; text-align: center; }
          .content { margin: 20px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Weekly Applications Report</h1>
          </div>
          <div class="content">
            <p>Hi HR Team,</p>
            <p>Please find attached the weekly report of all internship applications and payment details.</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: ["hr@vyntyraconsultancyservices.in", "internshipsupport@vyntyraconsultancyservices.in"],
      subject: `Weekly Applications Report - ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      html,
      attachments: [
        {
          filename: `applications-report-${Date.now()}.xlsx`,
          content: excelBuffer,
        },
      ],
    });
    console.log("Weekly report sent to HR team");
  } catch (error) {
    console.error("Failed to send weekly report:", error);
    throw error;
  }
};

export default transporter;
