# Vyntyra Internship Backend

This service implements the internship application workflow with high-volume ingestion, Razorpay verification, async invoice/email automation, daily reminder scheduling, and weekly XLSX reporting.

## Setup
1. Run `npm install` to install dependencies.
2. Copy `.env.example` to `.env` and configure MongoDB, Razorpay, RabbitMQ, SMTP, and AWS S3.
3. Ensure RabbitMQ and MongoDB are running before starting the API.

## Running
- `npm run dev` (requires `nodemon`) while working locally.
- `npm start` for production.

## API Endpoints
- `POST /api/applications`
	- Accepts `multipart/form-data` with fields:
		- `full_name`, `phone`, `email`, `college_name`, `college_location`, `preferred_domain`, `languages`, `remote_comfort`, `placement_contact`, `consent`
		- `resume` (PDF only)
	- Creates application with `PENDING_PAYMENT` status and queues async resume upload to S3.

- `POST /api/payments/create-order`
	- Body: `{ "applicationId": "...", "amount": 499 }`
	- Creates Razorpay order and a pending payment record.

- `POST /api/payments/verify`
	- Body: `{ "razorpayOrderId": "...", "razorpayPaymentId": "...", "razorpaySignature": "..." }`
	- Verifies Razorpay signature, fetches transaction metadata, marks application paid, and queues post-payment automation.

## Async Jobs
RabbitMQ routes these job types:
- `resume-upload`: Upload candidate resume from local temp path to S3, store signed URL in DB.
- `payment-success`: Generate invoice PDF, upload to S3, send candidate + HR emails.
- `payment-reminder`: Send payment reminder email and deduplicate within 24h window.
- `weekly-report`: Generate XLSX report and email to HR + support.

## Scheduled Automation
- Daily 9:00 AM IST:
	- Finds `PENDING_PAYMENT` applications older than 24h.
	- Queues payment reminder jobs.
- Friday 11:59 PM IST:
	- Queues weekly consolidated export email.

## Notes
- Files are never stored in MongoDB binary fields.
- Resume and invoice files are uploaded to S3, and only URLs are persisted.
- Invoice numbers are sequential and verifiable (example: `INV-2026-00001`).
