import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "path";
import crypto from "node:crypto";

import Application from "../models/Application.js";
// import { publishJob } from "../services/rabbitmq.js";
import { sendWelcomeEmail } from "../services/email.js";
import { handleResumeUpload } from "../jobs/handlers.js";

const router = Router();
const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

const ensureUploadDir = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
    cb(null, `${Date.now()}-${sanitized}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      const error = new Error("Resume must be a PDF document.");
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

const requiredFields = [
  "full_name",
  "phone",
  "email",
  "linkedin_url",
  "college_name",
  "college_location",
  "preferred_domain",
  "languages",
  "remote_comfort",
  "placement_contact",
];

const REGISTRATION_PREFIX = "VYN";
const REGISTRATION_LENGTH = 12;
const REGISTRATION_PHONE_DIGITS = 5;
const REGISTRATION_RANDOM_LENGTH = REGISTRATION_LENGTH - REGISTRATION_PREFIX.length - REGISTRATION_PHONE_DIGITS;

const buildRegistrationId = (phoneNumber) => {
  const digits = String(phoneNumber || "").replace(/\D/g, "");
  const phoneSegment = digits.slice(-REGISTRATION_PHONE_DIGITS).padStart(REGISTRATION_PHONE_DIGITS, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let randomSegment = "";
  for (let index = 0; index < REGISTRATION_RANDOM_LENGTH; index += 1) {
    randomSegment += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return `${REGISTRATION_PREFIX}${phoneSegment}${randomSegment}`;
};

const generateUniqueRegistrationId = async (phoneNumber) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const registrationId = buildRegistrationId(phoneNumber);
    const exists = await Application.exists({ registrationId });
    if (!exists) {
      return registrationId;
    }
  }

  const error = new Error("Unable to allocate registration ID. Please try again.");
  error.statusCode = 503;
  throw error;
};

const isValidHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

router.post("/", upload.single("resume"), async (req, res, next) => {
  try {
    for (const field of requiredFields) {
      const value = String(req.body[field] ?? "").trim();
      if (!value) {
        return res.status(400).json({ message: `Missing submission data: ${field}` });
      }
    }

    const consent =
  req.body.consent === true ||
  req.body.consent === "true" ||
  req.body.consent === "on";

if (!consent) {
  return res.status(400).json({
    message: "You must consent to data processing before applying."
  });
}

    const resumeLink = String(req.body.resume_link ?? "").trim();

    if (!req.file && !resumeLink) {
      return res.status(400).json({ message: "Provide either resume upload (PDF) or a public resume link." });
    }

    if (resumeLink && !isValidHttpUrl(resumeLink)) {
      return res.status(400).json({ message: "Resume link must be a valid public URL (http/https)." });
    }

    const resumePath = req.file
      ? path.relative(process.cwd(), req.file.path).split(path.sep).join("/")
      : undefined;

    const parsedInternshipPrice = Number.parseInt(String(req.body.internship_price ?? ""), 10);
    const preferredDomain = String(req.body.preferred_domain ?? "").trim();
    const normalizedPreferredDomain = preferredDomain.toLowerCase();

    const document = {
      fullName: req.body.full_name.trim(),
      phone: req.body.phone.trim(),
      email: req.body.email.trim(),
      linkedinUrl: req.body.linkedin_url.trim(),
      collegeName: req.body.college_name.trim(),
      collegeLocation: req.body.college_location.trim(),
      preferredDomain,
      languages: req.body.languages.trim(),
      remoteComfort: req.body.remote_comfort.trim(),
      placementContact: req.body.placement_contact.trim(),
      selectedDuration: String(req.body.selected_duration ?? "").trim() || undefined,
      selectedAddons: String(req.body.selected_addons ?? "").trim() || undefined,
      registrationId: await generateUniqueRegistrationId(req.body.phone),
      internshipPrice: normalizedPreferredDomain === "test"
        ? 1
        : (Number.isFinite(parsedInternshipPrice) && parsedInternshipPrice > 0
          ? parsedInternshipPrice
          : undefined),
      resumePath,
      resumeUrl: resumeLink || undefined,
      consent: true,
    };

    const application = await Application.create(document);

    // Keep application flow reliable even if SMTP is temporarily unavailable.
    await sendWelcomeEmail(application.email, application.fullName).catch((error) => {
      console.error("Failed to send welcome email:", error?.message || error);
    });

    if (req.file) {
      // Directly handle resume upload inline (no queue)
      await handleResumeUpload({
        applicationId: String(application._id),
        localResumePath: resumePath,
        originalName: req.file.originalname,
      });
    }

    return res.status(201).json({
      message: "Application submitted. Please complete payment to secure your slot.",
      applicationId: application._id,
      status: application.status,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
