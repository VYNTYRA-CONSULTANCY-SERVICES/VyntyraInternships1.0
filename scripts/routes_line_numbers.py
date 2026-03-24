from pathlib import Path
lines = Path('backend/src/routes/applications.js').read_text().splitlines()
for idx, line in enumerate(lines, 1):
    if 'const router = Router();' in line:
        print('router', idx)
        break
for idx, line in enumerate(lines, 1):
    if 'const upload = multer' in line:
        print('upload', idx)
        break
for idx, line in enumerate(lines, 1):
    if 'router.post("/", upload.single' in line:
        print('post', idx)
        break
