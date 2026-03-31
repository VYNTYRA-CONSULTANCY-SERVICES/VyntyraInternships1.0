import { Router } from "express";

import Counter from "../models/Counter.js";

const router = Router();
const VISITOR_COUNTER_KEY = "visitors:internships-home";

const getVisitorCount = async () => {
  const counter = await Counter.findOne({ key: VISITOR_COUNTER_KEY }).lean();
  return Number(counter?.seq || 0);
};

router.get("/visitors", async (_req, res, next) => {
  try {
    const count = await getVisitorCount();
    return res.json({ count });
  } catch (error) {
    return next(error);
  }
});

router.post("/visitors/hit", async (_req, res, next) => {
  try {
    const counter = await Counter.findOneAndUpdate(
      { key: VISITOR_COUNTER_KEY },
      {
        $inc: { seq: 1 },
        $setOnInsert: { key: VISITOR_COUNTER_KEY, createdAt: new Date(), seq: 0 },
        $set: { updatedAt: new Date() },
      },
      { new: true, upsert: true }
    ).lean();

    return res.status(201).json({ count: Number(counter?.seq || 0) });
  } catch (error) {
    return next(error);
  }
});

export default router;
