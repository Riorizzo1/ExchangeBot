from PIL import Image, ImageDraw, ImageFont
import json
from pathlib import Path
rows = json.loads(Path('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_compare_exact.json').read_text())
rows = [r for r in rows if r['status'] in ('FOR SALE','PENDING')]
out = Path('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_exact.jpg')
W,H = 1600, 1180
BG='#0b1220'; PANEL='#111a2b'; BORDER='#223047'; INK='#f6f7fb'; MUTED='#9aa4b2'; COLORS={'FOR SALE':'#34d399','PENDING':'#fbbf24'}
img = Image.new('RGB', (W,H), BG)
d = ImageDraw.Draw(img)

try:
    title_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 42)
    sub_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
    head_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)
    body_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 21)
    pill_f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 18)
except Exception:
    title_f = sub_f = head_f = body_f = pill_f = ImageFont.load_default()

d.rounded_rectangle((28,28,W-28,H-28), radius=26, fill=PANEL, outline=BORDER, width=2)
d.text((60,54), 'RWI Delta, exact fresh scan vs baseline', fill=INK, font=title_f)
d.text((60,100), 'Only FOR SALE and PENDING rows from the exact delta set', fill=MUTED, font=sub_f)

sale_count = sum(1 for r in rows if r['status'] == 'FOR SALE')
pending_count = sum(1 for r in rows if r['status'] == 'PENDING')
d.text((1180,60), f'FOR SALE: {sale_count}', fill=COLORS['FOR SALE'], font=head_f)
d.text((1180,95), f'PENDING: {pending_count}', fill=COLORS['PENDING'], font=head_f)

cols=[('Status',170),('Watch',860),('Price',230),('Posted',220)]
xs=[60,250,1120,1360]
y0=170
for (label,width),x in zip(cols,xs):
    d.rounded_rectangle((x,y0,x+width,y0+46), radius=12, fill='#0f172a', outline=BORDER, width=1)
    d.text((x+14,y0+10), label, fill=INK, font=head_f)

row_y=235; row_h=72
for r in rows:
    status=r['status']; pill_color=COLORS[status]
    d.rounded_rectangle((60,row_y,220,row_y+row_h), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((250,row_y,1090,row_y+row_h), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((1120,row_y,1350,row_y+row_h), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((1360,row_y,1550,row_y+row_h), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((76,row_y+18,204,row_y+52), radius=17, fill=pill_color)
    d.text((90,row_y+21), status, fill='#0b1220', font=pill_f)
    d.text((268,row_y+22), r['watch'], fill=INK, font=body_f)
    d.text((1138,row_y+22), r['cost'], fill=INK, font=body_f)
    d.text((1378,row_y+22), r['posted'], fill=INK, font=body_f)
    row_y += row_h + 10

img.save(out, quality=95)
print(out)
