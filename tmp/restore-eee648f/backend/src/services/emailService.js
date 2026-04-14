import nodemailer from "nodemailer";

export const sendEnrollmentEmail = async ({ to, name, invoicePath }) => {
  const transporter = nodemailer.createTransport({
    service: "gmail", // or use SendGrid (better for production)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"Vyntyra Internships" <${process.env.EMAIL_USER}>`,
    to,
    subject: "🎉 Enrollment Successful - Vyntyra Internships",
    html: `
      <h2>Hello ${name},</h2>
      <p>Thank you for enrolling with <b>Vyntyra Consultancy Services</b>.</p>
      <p>Your payment has been successfully processed.</p>
      <p>Please find your invoice attached.</p>
      <br/>
      <p>Best Regards,<br/>Team Vyntyra</p>
    `,
    attachments: [
      {
        filename: "invoice.pdf",
        path: invoicePath,
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};