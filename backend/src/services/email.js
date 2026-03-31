import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.ZOHO_SMTP_HOST || process.env.SMTP_HOST || "smtp.zoho.com",
  port: parseInt(process.env.ZOHO_SMTP_PORT || process.env.SMTP_PORT || "465", 10),
  secure: String(process.env.ZOHO_SMTP_SECURE || process.env.SMTP_SECURE || "true") === "true",
  auth: {
    user: process.env.ZOHO_EMAIL || process.env.SMTP_USER,
    pass: process.env.ZOHO_APP_PASSWORD || process.env.SMTP_PASS,
  },
});

const defaultFromEmail = process.env.ZOHO_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

export const sendWelcomeEmail = async (userEmail, userName) => {
  const mailOptions = {
    from: `"Vyntyra Academy" <${defaultFromEmail}>`,
    to: userEmail,
    subject: "Internship Application Received!",
    html: `
      <h1>Hello ${userName},</h1>
      <p>Thank you for applying to the <b>Vyntyra Summer Internship 2026</b>.</p>
      <p>Our team is reviewing your profile. You will receive an update within 5 working days.</p>
      <br />
      <p>Best regards,<br />Jami Eswar Anil Kumar<br />Founder, Vyntyra</p>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`Welcome email sent to ${userEmail}`);
};

/**
 * Send confirmation email to candidate after payment
 * @param {string} candidateEmail - Candidate email
 * @param {string} candidateName - Candidate name
 * @param {object} paymentDetails - Payment details
 */
export const sendConfirmationEmail = async (
  candidateEmail,
  candidateName,
  paymentDetails,
  meta = {}
) => {
  const formatDateTime = (value) => {
    if (!value) {
      return "N/A";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "N/A";
    }
    return parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  };

  const paymentTimestamp = formatDateTime(paymentDetails.timestamp);
  const addOns = meta.applicationDetails?.selectedAddons || "None";
  const duration = meta.applicationDetails?.selectedDuration || "Not Selected";
  const domain = meta.applicationDetails?.preferredDomain || "Not Selected";
  const registrationId = meta.registrationId || "N/A";
  const resumeLink = meta.resumeUrl || null;

  const html = `
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #eef2f7;
            font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: #1f2a37;
          }
          .wrapper {
            width: 100%;
            padding: 28px 12px;
          }
          .container {
            max-width: 720px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 10px 36px rgba(15, 23, 42, 0.12);
          }
          .header {
            background: linear-gradient(130deg, #0b3b8f 0%, #1553b7 45%, #1e6de0 100%);
            color: #ffffff;
            padding: 36px 32px;
          }
          .header h1 {
            margin: 0;
            font-size: 30px;
            font-weight: 700;
            letter-spacing: 0.2px;
          }
          .header p {
            margin: 10px 0 0;
            font-size: 14px;
            opacity: 0.92;
          }
          .content {
            padding: 30px 32px 24px;
          }
          .intro {
            font-size: 15px;
            line-height: 1.65;
          }
          .section-title {
            margin: 24px 0 10px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #0b3b8f;
            font-weight: 700;
          }
          .grid {
            display: table;
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
          }
          .row {
            display: table-row;
          }
          .label,
          .value {
            display: table-cell;
            padding: 11px 12px;
            border-bottom: 1px solid #eef2f7;
            font-size: 13px;
            vertical-align: top;
          }
          .label {
            width: 42%;
            background: #f8fafc;
            color: #334155;
            font-weight: 600;
          }
          .value {
            color: #0f172a;
            word-break: break-word;
          }
          .highlight {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #0b3b8f;
            border-radius: 8px;
            padding: 12px;
            font-size: 13px;
            margin-top: 16px;
          }
          .links {
            margin: 18px 0 6px;
            font-size: 13px;
            line-height: 1.8;
          }
          .links a {
            color: #1553b7;
            font-weight: 600;
            text-decoration: none;
          }
          .cta {
            margin: 22px 0 0;
            font-size: 14px;
            line-height: 1.7;
          }
          .footer {
            margin-top: 26px;
            padding-top: 18px;
            border-top: 1px solid #e2e8f0;
            font-size: 12px;
            color: #6b7280;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
        <div class="container">
          <div class="header">
            <h1>Enrollment Confirmed</h1>
            <p>Vyntyra Internship Program | Candidate Success Desk</p>
          </div>
          <div class="content">
            <p class="intro">Dear ${candidateName},</p>
            <p class="intro">Your internship application and payment have been successfully recorded. Your profile is now in our priority review pipeline.</p>

            <div class="section-title">Applicant Snapshot</div>
            <div class="grid">
              <div class="row"><div class="label">Applicant Name</div><div class="value">${candidateName || "N/A"}</div></div>
              <div class="row"><div class="label">Phone</div><div class="value">${meta.applicationDetails?.phone || "N/A"}</div></div>
              <div class="row"><div class="label">Email</div><div class="value">${candidateEmail || "N/A"}</div></div>
              <div class="row"><div class="label">Registered Domain</div><div class="value">${domain}</div></div>
              <div class="row"><div class="label">Program Duration</div><div class="value">${duration}</div></div>
              <div class="row"><div class="label">Add-ons</div><div class="value">${addOns}</div></div>
            </div>

            <div class="section-title">Registration Credentials</div>
            <div class="grid">
              <div class="row"><div class="label">Unique Registration ID</div><div class="value"><strong>${registrationId}</strong></div></div>
              <div class="row"><div class="label">Application Status</div><div class="value">Payment Verified | Review In Progress</div></div>
            </div>

            <div class="section-title">Payment Confirmation</div>
            <div class="grid">
              <div class="row"><div class="label">Amount Paid</div><div class="value">INR ${Number(paymentDetails.amount || 0).toFixed(2)}</div></div>
              <div class="row"><div class="label">Payment Method</div><div class="value">${paymentDetails.method || "N/A"}</div></div>
              <div class="row"><div class="label">Transaction ID</div><div class="value">${paymentDetails.transactionId || "N/A"}</div></div>
              <div class="row"><div class="label">Payment Reference</div><div class="value">${paymentDetails.last4OrVpa || "N/A"}</div></div>
              <div class="row"><div class="label">Paid On (IST)</div><div class="value">${paymentTimestamp}</div></div>
            </div>

            <div class="highlight">Payment receipt PDF and your uploaded resume are attached to this email for your records.</div>

            <div class="links">
              ${resumeLink ? `Resume Link: <a href="${resumeLink}">View Uploaded Resume</a><br/>` : ""}
              Company Website: <a href="https://vyntyraconsultancyservices.in">vyntyraconsultancyservices.in</a>
            </div>

            <p class="cta">Our admissions team will share the next onboarding update shortly. We appreciate your decision to build your career with Vyntyra.</p>

            <p>
              Regards,<br>
              <strong>Admissions & Partnerships Team</strong><br>
              Vyntyra Consultancy Services
            </p>

            <div class="footer">
              This is an automated email from Vyntyra Internship Operations. Please keep this message for future reference and quote your Registration ID for support requests.
            </div>
          </div>
        </div>
        </div>
      </body>
    </html>
  `;

  const attachments = [];

  if (meta.receiptBuffer) {
    attachments.push({
      filename: `payment-receipt-${registrationId}.pdf`,
      content: meta.receiptBuffer,
      contentType: "application/pdf",
    });
  }

  if (meta.resumeAttachment) {
    attachments.push(meta.resumeAttachment);
  }

  try {
    await transporter.sendMail({
      from: `"Vyntyra Admissions Desk" <${defaultFromEmail}>`,
      to: candidateEmail,
      subject: `Enrollment Confirmed | ${registrationId} | Vyntyra Internship Program`,
      html,
      attachments,
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
 */
export const sendHRNotification = async (
  candidateName,
  candidateEmail,
  applicationDetails
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
            
            <p><strong>Payment Record:</strong> Captured and verified in backend.</p>
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
      from: defaultFromEmail,
      to: "hr@vyntyraconsultancyservices.in",
      subject: `New Application: ${candidateName}`,
      html,
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
      from: defaultFromEmail,
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
      from: defaultFromEmail,
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
