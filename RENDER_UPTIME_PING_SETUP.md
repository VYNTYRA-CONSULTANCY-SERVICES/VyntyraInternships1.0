# Render Uptime Ping Setup Guide

This guide keeps your backend warm and gives stable response times on Render.

## 1. Use the health endpoint

Your backend already exposes these endpoints:
- `GET /health`
- `GET /keep-alive`

Use one of them for periodic uptime checks.

Recommended URL:
- `https://vyntyrainternships-backend.onrender.com/health`

## 2. Recommended ping frequency

- Ping every 5 minutes for free-tier style environments.
- Timeout for each request: 10 seconds.
- Retry once on failure.

## 3. UptimeRobot setup (fastest option)

1. Create monitor type: HTTP(s).
2. URL: your `/health` endpoint.
3. Interval: 5 minutes.
4. Alert contacts: email + WhatsApp/Telegram (optional).
5. Save and verify first check returns `200 OK`.

## 4. Cron-job.org alternative

1. Create a cron job for your `/health` endpoint.
2. Schedule: every 5 minutes.
3. Method: GET.
4. Timeout: 10 seconds.

## 5. GitHub Actions alternative

Use if you want monitor config in code.

```yaml
name: keep-render-awake
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping backend health endpoint
        run: |
          curl -fsS --max-time 10 https://vyntyrainternships-backend.onrender.com/health
```

## 6. Validate from terminal

```bash
curl -i https://vyntyrainternships-backend.onrender.com/health
curl -i https://vyntyrainternships-backend.onrender.com/keep-alive
```

Expected result:
- HTTP 200
- Small JSON payload

## 7. Read timing logs in production

Enable in backend environment:

- `ENABLE_REQUEST_TIMING_LOGS=true`
- `REQUEST_TIMING_SAMPLE_RATE=1`

What you will see in logs:
- `[request-timing] ... durationMs=...`
- `[payment-timing] create-order ...`
- `[payment-timing] verify ...`
- `[payment-timing] payu-initiate ...`
- `[payment-timing] payu-callback ...`

## 8. Recommended production defaults

- `REQUEST_TIMING_SAMPLE_RATE=1` during debugging.
- Reduce to `0.2` once stable to lower log volume.
- Keep `RABBITMQ_CONNECT_TIMEOUT_MS=2500` and `RABBITMQ_CIRCUIT_OPEN_MS=30000`.

## 9. If you still see cold starts

- Render free instances can still sleep if no incoming traffic for long windows.
- Keep external pings active 24x7.
- Consider upgrading Render plan for always-on instances.
