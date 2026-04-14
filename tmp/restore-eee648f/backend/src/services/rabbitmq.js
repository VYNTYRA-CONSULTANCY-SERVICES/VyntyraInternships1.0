import amqp from "amqplib";

const AMQP_URL = process.env.RABBITMQ_URL ?? "amqp://127.0.0.1:5672";
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE ?? "vyntyra.jobs";
const EXCHANGE_TYPE = "topic";
const CONNECT_TIMEOUT_MS = Number(process.env.RABBITMQ_CONNECT_TIMEOUT_MS ?? 2500);
const CIRCUIT_OPEN_MS = Number(process.env.RABBITMQ_CIRCUIT_OPEN_MS ?? 30000);

let connection;
let publishChannel;
let connectionReady = false;
let unavailableUntil = 0;
let connectingPromise;

const withTimeout = (promise, timeoutMs, label) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    }),
  ]);
};

const resetConnectionState = () => {
  connection = undefined;
  publishChannel = undefined;
  connectionReady = false;
};

export const connectRabbitMQ = async ({ force = false, timeoutMs = CONNECT_TIMEOUT_MS } = {}) => {
  if (connection && publishChannel && connectionReady) {
    return { connection, publishChannel };
  }

  if (!force && Date.now() < unavailableUntil) {
    return null;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = (async () => {
    try {
      const conn = await withTimeout(amqp.connect(AMQP_URL), timeoutMs, "RabbitMQ connect");
      const channel = await withTimeout(conn.createChannel(), timeoutMs, "RabbitMQ channel");
      await withTimeout(
        channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true }),
        timeoutMs,
        "RabbitMQ exchange assert"
      );

      connection = conn;
      publishChannel = channel;
      connectionReady = true;
      unavailableUntil = 0;

      connection.on("close", () => {
        console.warn("RabbitMQ connection closed, will reconnect on next use");
        resetConnectionState();
      });

      connection.on("error", (error) => {
        console.warn("RabbitMQ connection error", error?.message);
        resetConnectionState();
      });

      console.log("RabbitMQ connected successfully");
      return { connection, publishChannel };
    } catch (error) {
      console.warn("RabbitMQ unavailable, opening circuit", error?.message);
      resetConnectionState();
      unavailableUntil = Date.now() + CIRCUIT_OPEN_MS;
      return null;
    } finally {
      connectingPromise = undefined;
    }
  })();

  return connectingPromise;
};

export const publishJob = async (routingKey, payload) => {
  try {
    // Fast-fail connection attempt to avoid blocking user-facing APIs.
    const result = await connectRabbitMQ({ timeoutMs: 1200 });
    if (!result || !publishChannel) {
      console.warn("RabbitMQ unavailable, job queuing failed for:", routingKey);
      return false;
    }

    const message = Buffer.from(JSON.stringify(payload ?? {}));
    publishChannel.publish(EXCHANGE_NAME, routingKey, message, {
      persistent: true,
      contentType: "application/json",
      timestamp: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn("Failed to publish job", error?.message);
    return false;
  }
};

export const startWorker = async (handlers) => {
  try {
    // Worker startup can use a longer timeout as this is not user-facing.
    const result = await connectRabbitMQ({ force: true, timeoutMs: 5000 });
    if (!result || !connection) {
      console.warn("RabbitMQ unavailable, worker not started");
      return false;
    }

    const workerChannel = await connection.createChannel();
    await workerChannel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

    const queueName = process.env.RABBITMQ_QUEUE ?? "vyntyra.jobs.queue";
    await workerChannel.assertQueue(queueName, { durable: true });

    const keys = Object.keys(handlers ?? {});
    for (const key of keys) {
      await workerChannel.bindQueue(queueName, EXCHANGE_NAME, key);
    }

    const prefetch = Number(process.env.RABBITMQ_PREFETCH ?? 20);
    await workerChannel.prefetch(prefetch);

    await workerChannel.consume(queueName, async (msg) => {
      if (!msg) {
        return;
      }

      const routingKey = msg.fields.routingKey;
      const handler = handlers[routingKey];

      try {
        const content = msg.content?.toString("utf-8") || "{}";
        const payload = JSON.parse(content);

        if (!handler) {
          workerChannel.ack(msg);
          return;
        }

        await handler(payload);
        workerChannel.ack(msg);
      } catch (error) {
        console.error("Worker failed", { routingKey, error: error?.message });
        const retries = Number(msg.properties.headers?.["x-retry-count"] ?? 0);

        if (retries >= 3) {
          workerChannel.ack(msg);
        } else {
          const newHeaders = { ...msg.properties.headers, "x-retry-count": retries + 1 };
          workerChannel.publish(EXCHANGE_NAME, routingKey, msg.content, {
            persistent: true,
            headers: newHeaders,
          });
          workerChannel.ack(msg);
        }
      }
    });

    console.log("RabbitMQ worker started");
    return true;
  } catch (error) {
    console.warn("RabbitMQ worker failed to start", error?.message);
    return false;
  }
};

export const closeRabbitMQ = async () => {
  if (publishChannel) {
    await publishChannel.close();
  }
  if (connection) {
    await connection.close();
  }

  resetConnectionState();
  unavailableUntil = 0;
};
