from PIL import Image, ImageDraw, ImageFont
import json, re, math
from pathlib import Path
rows = json.loads(Path('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json').read_text())['threads']
rows = [r for r in rows if r.get('capturedAt','')[:10] == '2026-04-11']
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
items.sort(key=lambda x:(0 if x['status']=='PENDING' else 1, x['posted']))
chunks=3
size=math.ceil(len(items)/chunks)
try:
    title_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 36)
    sub_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
    head_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
    body_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 19)
    pill_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 16)
except Exception:
    title_f=sub_f=head_f=body_f=pill_f=ImageFont.load_default()
COLORS={'FOR SALE':'#34d399','PENDING':'#fbbf24'}
for idx in range(chunks):
    part=items[idx*size:(idx+1)*size]
    W,H=1400, 220+len(part)*62
    img=Image.new('RGB',(W,H),'#0b1220'); d=ImageDraw.Draw(img)
    d.rounded_rectangle((24,24,W-24,H-24), radius=22, fill='#111a2b', outline='#223047', width=2)
    d.text((50,44), f'RWI Today, FOR SALE + PENDING (Part {idx+1}/{chunks})', fill='#f6f7fb', font=title_f)
    d.text((50,86), 'Today only, split for phone readability', fill='#9aa4b2', font=sub_f)
    d.text((990,50), f'FOR SALE: {sum(1 for i in part if i["status"]=="FOR SALE")}', fill=COLORS['FOR SALE'], font=head_f)
    d.text((990,80), f'PENDING: {sum(1 for i in part if i["status"]=="PENDING")}', fill=COLORS['PENDING'], font=head_f)
    xs=[50,220,960,1160]; y0=140
    for label,width,x in [('Status',150,50),('Watch',700,220),('Price',180,960),('Posted',180,1160)]:
        d.rounded_rectangle((x,y0,x+width,y0+40), radius=10, fill='#0f172a', outline='#223047', width=1)
        d.text((x+12,y0+8), label, fill='#f6f7fb', font=head_f)
    y=194
    for r in part:
        d.rounded_rectangle((50,y,200,y+50), radius=12, fill='#0f172a', outline='#223047', width=1)
        d.rounded_rectangle((220,y,920,y+50), radius=12, fill='#0f172a', outline='#223047', width=1)
        d.rounded_rectangle((960,y,1140,y+50), radius=12, fill='#0f172a', outline='#223047', width=1)
        d.rounded_rectangle((1160,y,1340,y+50), radius=12, fill='#0f172a', outline='#223047', width=1)
        d.rounded_rectangle((66,y+13,184,y+35), radius=11, fill=COLORS[r['status']])
        d.text((79,y+15), r['status'], fill='#0b1220', font=pill_f)
        d.text((236,y+14), r['watch'], fill='#f6f7fb', font=body_f)
        d.text((978,y+14), r['cost'], fill='#f6f7fb', font=body_f)
        d.text((1178,y+14), r['posted'], fill='#f6f7fb', font=body_f)
        y += 62
    out=Path(f'/Users/bobby/.openclaw/workspace/rwi_mvp/today_fp_chart_part{idx+1}.jpg')
    img.save(out, quality=95)
    print(out)
