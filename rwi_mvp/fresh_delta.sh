#!/bin/zsh
set -e
openclaw browser --browser-profile openclaw start
openclaw browser --browser-profile openclaw navigate "https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc"
python3 rwi_mvp/wrap_extractor.py
node rwi_mvp/src/run-crawl.js
node rwi_mvp/delta_compare.mjs
