from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

out = Path('/Users/bobby/.openclaw/workspace/rwi_mvp/compact_chart.jpg')
img = Image.new('RGB', (1400, 900), '#0b1220')
d = ImageDraw.Draw(img)

try:
    title = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 48)
    big = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 34)
    body = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
    small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
except Exception:
    title = big = body = small = ImageFont.load_default()

# panel
d.rounded_rectangle((40,40,1360,860), radius=28, fill='#111827', outline='#243042', width=2)

d.text((70,70), 'RWI Delta Summary', fill='#f9fafb', font=title)
d.text((70,130), 'Fresh scan vs baseline', fill='#9ca3af', font=body)

# top stats cards
cards = [
    ('FOR SALE', '5', (52,211,153)),
    ('PENDING', '3', (251,191,36)),
    ('SOLD', '0', (96,165,250)),
]
x = 70
for label, val, color in cards:
    d.rounded_rectangle((x, 180, x+380, 310), radius=22, fill='#0f172a', outline='#243042', width=2)
    d.text((100, 205), label, fill='#9ca3af', font=body)
    d.text((100, 245), val, fill='#f9fafb', font=big)
    d.rounded_rectangle((250, 235, x+350, 275), radius=18, fill=color)
    x += 400

# price band section
d.text((70, 360), 'Price snapshot', fill='#f9fafb', font=big)
lines = [
    'Lowest: £275',
    'Highest: USD1200',
    'Common band: USD650 to USD1200',
]
y = 420
for line in lines:
    d.rounded_rectangle((70, y, 1330, y+80), radius=18, fill='#0f172a', outline='#243042', width=1)
    d.text((100, y+24), line, fill='#f9fafb', font=body)
    y += 100

# footer
d.text((70, 790), 'This is the delta only, not the full crawl.', fill='#9ca3af', font=small)

img.save(out, quality=95)
print(out)
