# RWI MVP

Local MVP for parsing Replica Watch Info sales threads.

## Goal
- build a baseline from the first scrape
- then report delta updates, especially new watches posted today
- answer in different output shapes later (json, text)

## Output
For each watch thread:
- title
- asking price
- currency
- listing time
- thread URL

## Commands
- `node src/index.js config`
- `node src/index.js parse-thread <thread-url> <file>`
- `node src/index.js today`
- `node src/index.js delta`
- `node src/index.js crawl-summary`
- `node src/index.js export text`
- `node src/index.js plan <index-text-file>`
- `node src/index.js save-snapshot <input-file> <output-file>`

## Import idea
Use `openclaw browser snapshot --format aria` and save the output to a file, then point `parse-thread` at the matching thread export.
