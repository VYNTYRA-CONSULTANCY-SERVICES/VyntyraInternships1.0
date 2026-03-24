import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "path";

import Application from "../models/Application.js";
import { publishJob } from "../services/rabbitmq.js";
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

    const document = {
      fullName: req.body.full_name.trim(),
      phone: req.body.phone.trim(),
      email: req.body.email.trim(),
      linkedinUrl: req.body.linkedin_url.trim(),
      collegeName: req.body.college_name.trim(),
      collegeLocation: req.body.college_location.trim(),
      preferredDomain: req.body.preferred_domain.trim(),
      languages: req.body.languages.trim(),
      remoteComfort: req.body.remote_comfort.trim(),
      placementContact: req.body.placement_contact.trim(),
      resumePath,
      resumeUrl: resumeLink || undefined,
      consent: true,
    };

    const application = await Application.create(document);

    if (req.file) {
      try {
        await publishJob("resume-upload", {
          applicationId: String(application._id),
          localResumePath: resumePath,
          originalName: req.file.originalname,
        });
      } catch (queueError) {
        // Keep submission successful even when RabbitMQ is unavailable.
        console.warn("Queue unavailable, running resume upload inline", queueError?.message);
        await handleResumeUpload({
          applicationId: String(application._id),
          localResumePath: resumePath,
          originalName: req.file.originalname,
        });
      }
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
