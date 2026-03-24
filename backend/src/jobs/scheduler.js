import cron from "node-cron";

import Application from "../models/Application.js";
import { publishJob } from "../services/rabbitmq.js";

const IST_TIMEZONE = "Asia/Kolkata";

export const startSchedulers = () => {
  // Daily 9:00 AM IST
  cron.schedule(
    "0 9 * * *",
    async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const pendingApplications = await Application.find({
        status: "PENDING_PAYMENT",
        createdAt: { $lt: cutoff },
        $or: [
          { lastReminderSentAt: { $exists: false } },
          { lastReminderSentAt: null },
          { lastReminderSentAt: { $lt: cutoff } },
        ],
      })
        .select({ _id: 1 })
        .lean();

      for (const app of pendingApplications) {
        await publishJob("payment-reminder", { applicationId: String(app._id) });
      }
    },
    { timezone: IST_TIMEZONE }
  );

  // Friday 11:59 PM IST
  cron.schedule(
    "59 23 * * 5",
    async () => {
      await publishJob("weekly-report", {
        generatedAt: new Date().toISOString(),
      });
    },
    { timezone: IST_TIMEZONE }
  );
};
