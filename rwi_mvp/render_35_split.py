from PIL import Image, ImageDraw, ImageFont
import json, re
from pathlib import Path
rows = json.loads(Path('/Users/bobby/.openclaw/workspace/rwi_mvp/today_extract.mjs.out.json').read_text())
bad = re.compile(r'(rules|scammer|warning|need to recertify|renew|member to member sales section rules|staff hold)', re.I)
seen=set(); exact=[]
for r in rows:
    if not (r['posted'].startswith('Today') or 'minutes ago' in r['posted']):
        continue
    if r['status']=='SOLD':
        continue
    if bad.search(r['watch']):
        continue
    key=r['watch'].lower().replace('  ',' ').strip()
    if key in seen:
        continue
    seen.add(key)
    exact.append(r)

def price_key(s):
    txt = str(s or '').replace(',', '')
    m = re.search(r'(\d+(?:\.\d+)?)', txt)
    return float(m.group(1)) if m else 10**9

fs = sorted([r for r in exact if r['status']=='FOR SALE'], key=lambda r: price_key(r['cost']))
pe = sorted([r for r in exact if r['status']=='PENDING'], key=lambda r: price_key(r['cost']))
BG='#0b1220'; PANEL='#111a2b'; BORDER='#223047'; INK='#f6f7fb'; MUTED='#9aa4b2'; COLORS={'FOR SALE':'#34d399','PENDING':'#fbbf24'}
try:
    title_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',40)
    sub_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
    section_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',30)
    body_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',19)
    pill_f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',16)
except Exception:
    title_f=sub_f=section_f=body_f=pill_f=ImageFont.load_default()

def render(status, items, color, outpath):
    W=1400; H=180 + len(items)*66 + 40
    img=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(img)
    d.rounded_rectangle((24,24,W-24,H-24), radius=24, fill=PANEL, outline=BORDER, width=2)
    d.text((48,44), f'RWI Today, {status}', fill=INK, font=title_f)
    d.text((48,92), 'Exact 35-item baseline, today only, unique by watch', fill=MUTED, font=sub_f)
    d.text((1120,52), f'TOTAL: {len(items)}', fill=color, font=title_f)
    d.rounded_rectangle((44,150,W-44,192), radius=12, fill='#0f172a', outline=BORDER, width=1)
    d.text((62,157), status, fill=color, font=section_f)
    y=204
    for r in items:
        d.rounded_rectangle((44,y,W-44,y+52), radius=12, fill='#0f172a', outline=BORDER, width=1)
        d.rounded_rectangle((62,y+13,182,y+36), radius=11, fill=color)
        d.text((76,y+14), r['status'], fill='#0b1220', font=pill_f)
        d.text((214,y+11), r['watch'], fill=INK, font=body_f)
        d.text((1018,y+11), r['cost'], fill=INK, font=body_f)
        d.text((1208,y+11), r['posted'], fill=INK, font=body_f)
        y += 66
    img.save(outpath, quality=95)
    print(outpath)

render('FOR SALE', fs, COLORS['FOR SALE'], Path('/Users/bobby/.openclaw/workspace/rwi_mvp/for_sale_35.jpg'))
render('PENDING', pe, COLORS['PENDING'], Path('/Users/bobby/.openclaw/workspace/rwi_mvp/pending_35.jpg'))
