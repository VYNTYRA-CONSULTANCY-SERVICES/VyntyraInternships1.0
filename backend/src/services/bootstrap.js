import { startSchedulers } from "../jobs/scheduler.js";
import { jobHandlers } from "../jobs/handlers.js";
import { connectRabbitMQ, startWorker } from "./rabbitmq.js";

let started = false;
let degraded = false;

export const startBackgroundServices = async () => {
  if (started) {
    return;
  }

  try {
    await connectRabbitMQ();
    await startWorker(jobHandlers);
    startSchedulers();
    started = true;
    degraded = false;
  } catch (error) {
    degraded = true;
    console.warn("Background services unavailable. Running API in degraded mode.", error?.message);
  }
};

export const isBackgroundDegraded = () => degraded;
