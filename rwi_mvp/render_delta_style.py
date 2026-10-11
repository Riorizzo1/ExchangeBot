from PIL import Image, ImageDraw, ImageFont
import json
from pathlib import Path

rows = json.loads(Path('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_compare.mjs.out.json').read_text())
out = Path('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_style.jpg')

W, H = 1600, 1100
BG = '#0b1220'
PANEL = '#111a2b'
BORDER = '#223047'
INK = '#f6f7fb'
MUTED = '#9aa4b2'
COLORS = {'FOR SALE':'#34d399', 'PENDING':'#fbbf24', 'SOLD':'#60a5fa'}

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)

try:
    title_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 42)
    subtitle_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
    head_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)
    body_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
    pill_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 18)
except Exception:
    title_f = subtitle_f = head_f = body_f = pill_f = ImageFont.load_default()

# outer panel
d.rounded_rectangle((28, 28, W-28, H-28), radius=26, fill=PANEL, outline=BORDER, width=2)

d.text((60, 54), 'RWI Delta, fresh scan vs baseline', fill=INK, font=title_f)
d.text((60, 100), 'New watches added since the last saved scan', fill=MUTED, font=subtitle_f)

# headers
cols = [('Status', 170), ('Watch', 860), ('Price', 230), ('Posted', 220)]
xs = [60, 250, 1120, 1360]
y0 = 170
for (label, width), x in zip(cols, xs):
    d.rounded_rectangle((x, y0, x+width, y0+46), radius=12, fill='#0f172a', outline=BORDER, width=1)
    d.text((x+14, y0+10), label, fill=INK, font=head_f)

# rows with actual delta items
row_y = 235
row_h = 72
for r in rows:
    status = r['status']
    if status not in ('FOR SALE', 'PENDING', 'SOLD'):
        status = 'FOR SALE'
    pill_color = COLORS[status]
    watch = r['watch']
    price = r['cost']
    posted = r['posted']

    # row blocks
    d.rounded_rectangle((60, row_y, 220, row_y+row_h), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((250, row_y, 1090, row_y+row_h), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((1120, row_y, 1350, row_y+row_h), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((1360, row_y, 1550, row_y+row_h), radius=14, fill='#0f172a', outline=BORDER, width=1)

    # status pill
    d.rounded_rectangle((76, row_y+18, 204, row_y+52), radius=17, fill=pill_color)
    d.text((90, row_y+21), status, fill='#0b1220', font=pill_f)

    # watch
    d.text((268, row_y+22), watch, fill=INK, font=body_f)
    # price + posted
    d.text((1138, row_y+22), price, fill=INK, font=body_f)
    d.text((1378, row_y+22), posted, fill=INK, font=body_f)

    row_y += row_h + 10
    if row_y > H - 90:
        break

img.save(out, quality=95)
print(out)
