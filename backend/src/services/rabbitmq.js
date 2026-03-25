import amqp from "amqplib";

const AMQP_URL = process.env.RABBITMQ_URL ?? "amqp://127.0.0.1:5672";
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE ?? "vyntyra.jobs";
const EXCHANGE_TYPE = "topic";
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

let connection;
let publishChannel;
let connectionReady = false;

export const connectRabbitMQ = async (retries = 0) => {
  if (connection && publishChannel && connectionReady) {
    return { connection, publishChannel };
  }

  try {
    // Add connection timeout
    const connectPromise = amqp.connect(AMQP_URL);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("RabbitMQ connection timeout")), 8000)
    );

    connection = await Promise.race([connectPromise, timeoutPromise]);
    publishChannel = await connection.createChannel();
    await publishChannel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

    connection.on("close", () => {
      console.warn("RabbitMQ connection closed, will reconnect on next use");
      connection = undefined;
      publishChannel = undefined;
      connectionReady = false;
    });

    connection.on("error", (error) => {
      console.warn("RabbitMQ connection error", error?.message);
      connection = undefined;
      publishChannel = undefined;
      connectionReady = false;
    });

    connectionReady = true;
    console.log("RabbitMQ connected successfully");
    return { connection, publishChannel };
  } catch (error) {
    console.warn(`RabbitMQ connection failed (attempt ${retries + 1}/${MAX_RETRIES})`, error?.message);
    
    if (retries < MAX_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return connectRabbitMQ(retries + 1);
    }

    // Don't throw - let system run in degraded mode
    connectionReady = false;
    return null;
  }
};

export const publishJob = async (routingKey, payload) => {
  try {
    const result = await connectRabbitMQ();
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
    const result = await connectRabbitMQ();
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
          persistent: true,
          headers: { "x-retry-count": retries + 1 },
        });
        workerChannel.ack(msg);
      }
    }
  });
};

export const closeRabbitMQ = async () => {
  if (publishChannel) {
    await publishChannel.close();
  }
  if (connection) {
    await connection.close();
  }

  publishChannel = undefined;
  connection = undefined;
};
