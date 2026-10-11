from pathlib import Path
src = Path('rwi_mvp/rwi_bookmarklet_extractor.js').read_text()
wrapped = '() => (async () => {\n' + src + '\n})()'
Path('rwi_mvp/rwi_bookmarklet_extractor_wrapped.js').write_text(wrapped)
print('wrapped')
