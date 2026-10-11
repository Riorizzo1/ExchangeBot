from PIL import Image, ImageDraw, ImageFont
import json, re
from pathlib import Path
rows = json.loads(Path('/Users/bobby/.openclaw/workspace/rwi_mvp/today_extract.mjs.out.json').read_text())
rows = [r for r in rows if (r['posted'].startswith('Today') or 'minutes ago' in r['posted']) and r['status'] != 'SOLD']
seen=set(); uniq=[]
for r in rows:
    key=r['watch'].lower().replace('  ',' ').strip()
    if key in seen: continue
    seen.add(key); uniq.append(r)
rows=uniq

def price_key(s):
    txt = str(s or '').replace(',', '')
    m = re.search(r'(\d+(?:\.\d+)?)', txt)
    return float(m.group(1)) if m else 10**9

fs = sorted([r for r in rows if r['status']=='FOR SALE'], key=lambda r: price_key(r['cost']))
pe = sorted([r for r in rows if r['status']=='PENDING'], key=lambda r: price_key(r['cost']))
W=1400; title_h=170; section_h=60; row_h=66; H=title_h + section_h + len(fs)*row_h + section_h + len(pe)*row_h + 80
BG='#0b1220'; PANEL='#111a2b'; BORDER='#223047'; INK='#f6f7fb'; MUTED='#9aa4b2'; COLORS={'FOR SALE':'#34d399','PENDING':'#fbbf24'}
img=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(img)
try:
    title_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',40)
    sub_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
    section_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',28)
    body_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',19)
    pill_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',16)
except Exception:
    title_f=sub_f=section_f=body_f=pill_f=ImageFont.load_default()

d.rounded_rectangle((24,24,W-24,H-24), radius=24, fill=PANEL, outline=BORDER, width=2)
d.text((48,44), 'RWI Today, clean pull baseline', fill=INK, font=title_f)
d.text((48,92), 'Today only, unique by watch, sorted cheapest first in each section', fill=MUTED, font=sub_f)
d.text((1020,50), f'FOR SALE: {len(fs)}', fill=COLORS['FOR SALE'], font=title_f)
d.text((1020,92), f'PENDING: {len(pe)}', fill=COLORS['PENDING'], font=title_f)

def draw_section(y, label, items, color):
    d.rounded_rectangle((44,y,W-44,y+42), radius=12, fill='#0f172a', outline=BORDER, width=1)
    d.text((62,y+7), label, fill=color, font=section_f)
    y += 52
    for r in items:
        d.rounded_rectangle((44,y,W-44,y+52), radius=12, fill='#0f172a', outline=BORDER, width=1)
        d.rounded_rectangle((62,y+13,182,y+36), radius=11, fill=color)
        d.text((76,y+14), r['status'], fill='#0b1220', font=pill_f)
        d.text((214,y+11), r['watch'], fill=INK, font=body_f)
        d.text((1018,y+11), r['cost'], fill=INK, font=body_f)
        d.text((1208,y+11), r['posted'], fill=INK, font=body_f)
        y += row_h
    return y

y=150
y=draw_section(y,'FOR SALE',fs,COLORS['FOR SALE'])
y+=10
y=draw_section(y,'PENDING',pe,COLORS['PENDING'])
out=Path('/Users/bobby/.openclaw/workspace/rwi_mvp/today_clean_phone.jpg')
img.save(out, quality=95)
print(out)
