PRAGMA foreign_keys = ON;

-- Cloudflare D1 schema for Vyntyra Internship Portal
-- Migrated from Mongo collections: Interns_Data (Application), payments, invoices.

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  college_name TEXT NOT NULL,
  college_location TEXT NOT NULL,
  preferred_domain TEXT NOT NULL,
  languages TEXT NOT NULL,
  remote_comfort TEXT NOT NULL,
  placement_contact TEXT NOT NULL,

  -- Resume can be either uploaded file (R2 key/url) or external URL.
  resume_key TEXT,
  resume_url TEXT,

  consent INTEGER NOT NULL DEFAULT 1 CHECK (consent IN (0, 1)),

  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK (status IN ('PENDING_PAYMENT', 'COMPLETED_AND_PAID', 'FAILED')),

  -- Soft references for quick lookup.
  payment_id TEXT,
  invoice_id TEXT,

  -- Reminder workflow fields.
  num_reminders INTEGER NOT NULL DEFAULT 0,
  last_reminder_sent_at TEXT,

  -- Optional pricing metadata from current frontend fields.
  selected_duration TEXT,
  selected_addons TEXT,
  internship_price INTEGER,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,

  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature TEXT,

  amount INTEGER NOT NULL,
  gateway TEXT NOT NULL DEFAULT 'razorpay' CHECK (gateway IN ('razorpay', 'payu')),

  payu_txn_id TEXT UNIQUE,
  payu_payment_id TEXT UNIQUE,
  payu_hash TEXT,
  payu_unmapped_status TEXT,

  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  method TEXT CHECK (method IN ('upi', 'card', 'netbanking', 'wallet') OR method IS NULL),
  vpa TEXT,
  card_last4 TEXT,
  contact TEXT,
  timestamp TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,

  invoice_number TEXT NOT NULL UNIQUE,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,

  payment_method TEXT,
  payment_timestamp TEXT,
  transaction_id TEXT,
  last4_or_vpa TEXT,
  amount INTEGER,
  currency TEXT,

  invoice_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'failed')),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_status ON payments(gateway, status);
CREATE INDEX IF NOT EXISTS idx_payments_timestamp ON payments(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_rzp_order_status ON payments(razorpay_order_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_payu_txn_status ON payments(payu_txn_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_applications_updated_at
AFTER UPDATE ON applications
FOR EACH ROW
BEGIN
  UPDATE applications SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_updated_at
AFTER UPDATE ON payments
FOR EACH ROW
BEGIN
  UPDATE payments SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_invoices_updated_at
AFTER UPDATE ON invoices
FOR EACH ROW
BEGIN
  UPDATE invoices SET updated_at = datetime('now') WHERE id = OLD.id;
END;
