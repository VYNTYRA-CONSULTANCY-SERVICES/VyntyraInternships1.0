from pathlib import Path

lines = Path('assets/css/premium-style.css').read_text().splitlines()
for idx, line in enumerate(lines, 1):
    if '.footer-top {' in line:
        print('footer-top', idx)
        break

for idx, line in enumerate(lines, 1):
    if '.footer-bottom {' in line:
        print('footer-bottom', idx)
        break
