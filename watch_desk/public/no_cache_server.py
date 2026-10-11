#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import json
import hashlib
import mimetypes
import os
from pathlib import Path
import sys
from io import BytesIO

from PIL import Image, ImageOps

IMAGE_HOSTS = {
    'preview.redd.it',
    'external-preview.redd.it',
    'i.redd.it',
    'media.redd.it',
    'redditmedia.com',
    'i.imgur.com',
    'imgur.com',
    'postimg.cc',
    'i.postimg.cc',
    'ibb.co',
    'images.clickpix.org',
    'cdn.jsdelivr.net',
}
CACHE_DIR = Path(__file__).resolve().parent / 'images' / 'proxy'
THUMB_CACHE_DIR = CACHE_DIR / 'thumbs'


def image_ext(url, content_type=''):
    path = urlparse(url).path.lower()
    for ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
        if path.endswith(ext):
            return ext
    if 'png' in content_type:
        return '.png'
    if 'webp' in content_type:
        return '.webp'
    if 'gif' in content_type:
        return '.gif'
    return '.jpg'


def allowed_image_url(url):
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ('http', 'https'):
        return False
    host = (parsed.hostname or '').lower()
    return any(host == allowed or host.endswith('.' + allowed) for allowed in IMAGE_HOSTS)


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path == '/api/push/watch/status':
            self.proxy_push('GET')
            return
        if urlparse(self.path).path == '/proxy-image':
            self.handle_proxy_image()
            return
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path.startswith('/api/push/watch/'):
            self.proxy_push('POST')
            return
        self.send_error(404, 'not found')

    def do_PUT(self):
        if urlparse(self.path).path == '/api/push/watch/preferences':
            self.proxy_push('PUT')
            return
        self.send_error(404, 'not found')

    def do_DELETE(self):
        if urlparse(self.path).path == '/api/push/watch/subscribe':
            self.proxy_push('DELETE')
            return
        self.send_error(404, 'not found')

    def proxy_push(self, method):
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length) if length else None
        try:
            request = Request(
                f'http://127.0.0.1:4318{urlparse(self.path).path}',
                data=body,
                method=method,
                headers={'Content-Type': 'application/json'} if body else {},
            )
            with urlopen(request, timeout=12) as upstream:
                response_body = upstream.read()
                status = upstream.status
                content_type = upstream.headers.get('content-type', 'application/json')
        except Exception as exc:
            self.send_error(502, f'push service unavailable: {exc}')
            return
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    def handle_proxy_image(self):
        params = parse_qs(urlparse(self.path).query)
        url = (params.get('u') or [''])[0]
        if not allowed_image_url(url):
            self.send_error(400, 'unsupported image host')
            return

        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha1(url.encode()).hexdigest()[:24]
        wants_thumb = (params.get('thumb') or [''])[0] == '1'
        if wants_thumb:
            THUMB_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            thumb = THUMB_CACHE_DIR / (key + '.jpg')
            if thumb.exists():
                self.serve_cached(thumb, 'image/jpeg')
                return
        cached = next(iter(CACHE_DIR.glob(key + '.*')), None)
        if not cached or not cached.exists():
            try:
                req = Request(
                    url,
                    headers={
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                        'Referer': 'https://www.reddit.com/' if 'redd.it' in url or 'reddit' in url else 'https://forum.replica-watch.info/',
                    },
                )
                with urlopen(req, timeout=10) as res:
                    content_type = res.headers.get('content-type', 'image/jpeg')
                    data = res.read(12_000_000)
                if not content_type.startswith('image/') or len(data) < 200:
                    raise ValueError('not an image')
                cached = CACHE_DIR / (key + image_ext(url, content_type))
                cached.write_bytes(data)
            except Exception as exc:
                self.send_error(502, f'image fetch failed: {exc}')
                return

        if wants_thumb:
            try:
                image = ImageOps.exif_transpose(Image.open(cached).convert('RGB'))
                image.thumbnail((520, 390), Image.Resampling.LANCZOS)
                canvas = Image.new('RGB', (520, 390), (13, 17, 24))
                canvas.paste(image, ((520 - image.width) // 2, (390 - image.height) // 2))
                canvas.save(thumb, quality=74, optimize=True, progressive=True)
                self.serve_cached(thumb, 'image/jpeg')
            except Exception as exc:
                self.send_error(502, f'image thumbnail failed: {exc}')
            return
        self.serve_cached(cached, mimetypes.guess_type(cached.name)[0] or 'image/jpeg')

    def serve_cached(self, path, content_type):
        self._cacheable_image = True
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(path.stat().st_size))
        self.end_headers()
        with path.open('rb') as fh:
            self.copyfile(fh, self.wfile)

    def end_headers(self):
        if getattr(self, '_cacheable_image', False):
            self.send_header('Cache-Control', 'public, max-age=604800, immutable')
        else:
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', '4314'))
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
