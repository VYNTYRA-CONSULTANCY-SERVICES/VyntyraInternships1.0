import { startSchedulers } from "../jobs/scheduler.js";
import { jobHandlers } from "../jobs/handlers.js";
import { connectRabbitMQ, startWorker } from "./rabbitmq.js";

let started = false;
let degraded = false;

export const startBackgroundServices = async () => {
  if (started) {
    return;
  }

  started = true;

  // Start all services in parallel without blocking
  Promise.all([
    (async () => {
      try {
        await connectRabbitMQ();
        await startWorker(jobHandlers);
      } catch (error) {
        console.warn("RabbitMQ worker failed to start", error?.message);
        degraded = true;
      }
    })(),
    (async () => {
      try {
        startSchedulers();
      } catch (error) {
        console.warn("Schedulers failed to start", error?.message);
        degraded = true;
      }
    })(),
  ]).catch((error) => {
    console.warn("Background services startup issues", error?.message);
    degraded = true;
  });
};

export const isBackgroundDegraded = () => degraded;
