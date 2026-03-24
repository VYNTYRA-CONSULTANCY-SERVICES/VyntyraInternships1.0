import amqp from "amqplib";

const AMQP_URL = process.env.RABBITMQ_URL ?? "amqp://127.0.0.1:5672";
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE ?? "vyntyra.jobs";
const EXCHANGE_TYPE = "topic";

let connection;
let publishChannel;

export const connectRabbitMQ = async () => {
  if (connection && publishChannel) {
    return { connection, publishChannel };
  }

  connection = await amqp.connect(AMQP_URL);
  publishChannel = await connection.createChannel();
  await publishChannel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

  connection.on("close", () => {
    connection = undefined;
    publishChannel = undefined;
  });

  return { connection, publishChannel };
};

export const publishJob = async (routingKey, payload) => {
  await connectRabbitMQ();
  const message = Buffer.from(JSON.stringify(payload ?? {}));

  publishChannel.publish(EXCHANGE_NAME, routingKey, message, {
    persistent: true,
    contentType: "application/json",
    timestamp: Date.now(),
  });
};

export const startWorker = async (handlers) => {
  await connectRabbitMQ();

  const workerChannel = await connection.createChannel();
  await workerChannel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

  const queueName = process.env.RABBITMQ_QUEUE ?? "vyntyra.jobs.queue";
  await workerChannel.assertQueue(queueName, { durable: true });

  const keys = Object.keys(handlers ?? {});
  for (const key of keys) {
    await workerChannel.bindQueue(queueName, EXCHANGE_NAME, key);
  }

  await workerChannel.prefetch(Number(process.env.RABBITMQ_PREFETCH ?? 20));

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
        workerChannel.publish(EXCHANGE_NAME, routingKey, msg.content, {
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
