# RWI MVP

Local MVP for parsing Replica Watch Info sales threads.

## Goal
- build a baseline from the first scrape
- then report delta updates, especially new watches posted today

## Output
For each watch thread:
- title
- asking price
- currency
- listing time
- thread URL

## Flow
1. capture the sales index snapshot
2. parse and store a baseline
3. run `today` to list watches captured today
4. later, re-run capture and only keep new thread IDs

## Commands
- `node src/index.js parse-thread <thread-url> <file>`
- `node src/index.js today`
- `node src/index.js plan <index-text-file>`
