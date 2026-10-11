#!/bin/zsh
set -euo pipefail
BODY=$(python3 - <<'PY'
from pathlib import Path
js = Path('/Users/bobby/.openclaw/workspace/rwi_mvp/rwi_bookmarklet_extractor.js').read_text()
js = js.replace('\nreturn extractRwiListings({ pages: 3, enrichPrices: true });\n', '\n')
print(js)
PY
)
openclaw browser evaluate --fn "async () => { ${BODY}; return await extractRwiListings({ pages: 3, enrichPrices: true }); }"
