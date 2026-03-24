from pathlib import Path
lines = Path('backend/server.js').read_text().splitlines()
for idx, line in enumerate(lines, 1):
    if 'app.use("/api/applications"' in line:
        print('route-mount', idx)
        break
for idx, line in enumerate(lines, 1):
    if 'app.get("/health"' in line:
        print('health', idx)
        break
for idx, line in enumerate(lines, 1):
    if 'connectDB' in line:
        print('connect', idx)
        break
