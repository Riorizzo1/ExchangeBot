from PIL import Image, ImageDraw, ImageFont
import json
from pathlib import Path

rows = json.loads(Path('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_compare.mjs.out.json').read_text())
out = Path('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_chart.jpg')

W, H = 1800, 1200
img = Image.new('RGB', (W, H), '#0b1220')
d = ImageDraw.Draw(img)

# fonts
try:
    title = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 44)
    head = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)
    body = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
    small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
except Exception:
    title = head = body = small = ImageFont.load_default()

colors = {
    'panel': '#111827',
    'border': '#263244',
    'ink': '#f9fafb',
    'muted': '#9ca3af',
    'for_sale': (52, 211, 153),
    'pending': (251, 191, 36),
    'sold': (96, 165, 250),
}

# outer panel
margin = 40
d.rounded_rectangle((margin, margin, W-margin, H-margin), radius=28, fill=colors['panel'], outline=colors['border'], width=2)

d.text((80, 70), 'RWI Delta, fresh scan vs baseline', fill=colors['ink'], font=title)
d.text((80, 125), 'New watches added since the last saved scan', fill=colors['muted'], font=body)

# column headers
cols = [('Status', 160), ('Watch', 940), ('Price', 260), ('Posted', 260)]
x = 80
y = 190
for label, width in cols:
    d.rounded_rectangle((x, y, x+width, y+48), radius=12, fill='#0f172a', outline=colors['border'], width=1)
    d.text((x+14, y+10), label, fill=colors['ink'], font=head)
    x += width + 10

# rows
row_y = 260
row_h = 84
for r in rows:
    status = 'FOR SALE' if 'SOLD' not in r['status'] and 'PENDING' not in r['status'] else r['status']
    color = colors['for_sale'] if status == 'FOR SALE' else colors['pending'] if status == 'PENDING' else colors['sold']
    watch = r['watch']
    price = r['cost']
    posted = r['posted']

    x = 80
    d.rounded_rectangle((x, row_y, x+160, row_y+row_h-10), radius=16, fill='#0f172a', outline=colors['border'], width=1)
    d.rounded_rectangle((x+12, row_y+18, x+148, row_y+48), radius=10, fill=color)
    d.text((x+28, row_y+20), status, fill='#0b1220', font=small)
    x += 170

    d.rounded_rectangle((x, row_y, x+940, row_y+row_h-10), radius=16, fill='#0f172a', outline=colors['border'], width=1)
    # wrap watch text
    words = watch.split()
    lines=[]
    line=''
    for w in words:
        test=(line+' '+w).strip()
        if d.textlength(test, font=body) < 900:
            line=test
        else:
            lines.append(line)
            line=w
    if line:
        lines.append(line)
    y_text = row_y + 14
    for ln in lines[:2]:
        d.text((x+16, y_text), ln, fill=colors['ink'], font=body)
        y_text += 28
    x += 950

    d.rounded_rectangle((x, row_y, x+260, row_y+row_h-10), radius=16, fill='#0f172a', outline=colors['border'], width=1)
    d.text((x+16, row_y+22), price, fill=colors['ink'], font=body)
    x += 270

    d.rounded_rectangle((x, row_y, x+260, row_y+row_h-10), radius=16, fill='#0f172a', outline=colors['border'], width=1)
    d.text((x+16, row_y+22), posted, fill=colors['ink'], font=body)

    row_y += row_h
    if row_y > H - 110:
        break

img.save(out, quality=95)
print(out)
