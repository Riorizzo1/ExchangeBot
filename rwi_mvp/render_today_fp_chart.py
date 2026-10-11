from PIL import Image, ImageDraw, ImageFont
import json, re
from pathlib import Path
rows = json.loads(Path('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json').read_text())['threads']
rows = [r for r in rows if (r.get('capturedAt','')[:10] == '2026-04-11')]
rows = [r for r in rows if 'Yesterday' not in (r.get('threadTime','') or '')]
rows = [r for r in rows if not re.search(r'\[SOLD\]', r.get('title',''), re.I)]
rows = [r for r in rows if re.search(r'\[FOR SALE\]|\[PENDING\]|reserved sale|\[reserved\]', r.get('title',''), re.I)]

def clean(s):
    return re.sub(r'\|\s*Replica Watch Info$', '', re.sub(r'^\(\d+\)\s*', '', re.sub(r'^\[(PENDING|FOR SALE|RESERVED|SOLD)\]\s*[-–—]?\s*', '', s, flags=re.I), flags=re.I)).strip()

def status(title):
    return 'PENDING' if re.search(r'\[PENDING\]|reserved sale|\[reserved\]', title, re.I) else 'FOR SALE'

items=[]
for r in rows:
    items.append({'status':status(r['title']),'watch':clean(r['title']),'cost':r.get('askingPrice',''),'posted':r.get('threadTime','')})
items.sort(key=lambda x:(0 if x['status']=='PENDING' else 1))

W,H=1600, 240+len(items)*66
BG='#0b1220'; PANEL='#111a2b'; BORDER='#223047'; INK='#f6f7fb'; MUTED='#9aa4b2'; COLORS={'FOR SALE':'#34d399','PENDING':'#fbbf24'}
img=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(img)
try:
    title_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 42)
    sub_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
    head_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)
    body_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 21)
    pill_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 18)
except Exception:
    title_f=sub_f=head_f=body_f=pill_f=ImageFont.load_default()

d.rounded_rectangle((28,28,W-28,H-28), radius=26, fill=PANEL, outline=BORDER, width=2)
d.text((60,54), 'RWI Today, FOR SALE + PENDING', fill=INK, font=title_f)
d.text((60,100), 'Only items posted today, no yesterday rows', fill=MUTED, font=sub_f)

d.text((1160,60), f'FOR SALE: {sum(1 for i in items if i["status"]=="FOR SALE")}', fill=COLORS['FOR SALE'], font=head_f)
d.text((1160,95), f'PENDING: {sum(1 for i in items if i["status"]=="PENDING")}', fill=COLORS['PENDING'], font=head_f)

cols=[('Status',170),('Watch',860),('Price',230),('Posted',220)]
xs=[60,250,1120,1360]; y0=170
for (label,width),x in zip(cols,xs):
    d.rounded_rectangle((x,y0,x+width,y0+46), radius=12, fill='#0f172a', outline=BORDER, width=1)
    d.text((x+14,y0+10), label, fill=INK, font=head_f)

y=235
for r in items:
    d.rounded_rectangle((60,y,220,y+56), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((250,y,1090,y+56), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((1120,y,1350,y+56), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((1360,y,1550,y+56), radius=14, fill='#0f172a', outline=BORDER, width=1)
    d.rounded_rectangle((76,y+14,204,y+42), radius=16, fill=COLORS[r['status']])
    d.text((90,y+17), r['status'], fill='#0b1220', font=pill_f)
    d.text((268,y+17), r['watch'], fill=INK, font=body_f)
    d.text((1138,y+17), r['cost'], fill=INK, font=body_f)
    d.text((1378,y+17), r['posted'], fill=INK, font=body_f)
    y += 66
out=Path('/Users/bobby/.openclaw/workspace/rwi_mvp/today_fp_chart.jpg')
img.save(out, quality=95)
print(out)
