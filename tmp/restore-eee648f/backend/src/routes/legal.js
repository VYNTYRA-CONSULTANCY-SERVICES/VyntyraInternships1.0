import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../../");

// Helper function to serve legal pages
const serveLegalPage = (req, res, filename) => {
  const filePath = path.join(projectRoot, filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Page Not Found</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
            h1 { color: #333; }
          </style>
        </head>
        <body>
          <h1>404 - Page Not Found</h1>
          <p>The requested legal page could not be found.</p>
          <a href="/">Go back to home</a>
        </body>
      </html>
    `);
  }
  
  res.sendFile(filePath);
};

// Routes for legal pages
router.get("/terms-and-conditions", (req, res) => {
  serveLegalPage(req, res, "terms-and-conditions.html");
});

router.get("/terms", (req, res) => {
  serveLegalPage(req, res, "terms-and-conditions.html");
});

router.get("/privacy-policy", (req, res) => {
  serveLegalPage(req, res, "privacy-policy.html");
});

router.get("/privacy", (req, res) => {
  serveLegalPage(req, res, "privacy-policy.html");
});

router.get("/refund-policy", (req, res) => {
  serveLegalPage(req, res, "refund-policy.html");
});

router.get("/refund", (req, res) => {
  serveLegalPage(req, res, "refund-policy.html");
});

router.get("/shipping-and-delivery", (req, res) => {
  serveLegalPage(req, res, "shipping-and-delivery.html");
});

router.get("/shipping", (req, res) => {
  serveLegalPage(req, res, "shipping-and-delivery.html");
});

router.get("/contact-us", (req, res) => {
  serveLegalPage(req, res, "contact-us.html");
});

router.get("/contact", (req, res) => {
  serveLegalPage(req, res, "contact-us.html");
});

export default router;

