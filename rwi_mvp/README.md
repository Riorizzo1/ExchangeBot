# RWI MVP

Local MVP for parsing Replica Watch Info sales threads.

## What it does
- stores raw thread text under `data/raw/`
- extracts a few structured fields into `data/rwi.json`
- supports a simple `parse-thread` command
- can plan a first-5-pages crawl from saved index text

## Flow
1. use OpenClaw browser snapshot on an index page
2. save the snapshot text into `data/raw/index.txt`
3. run `node src/index.js plan data/raw/index.txt`
4. save each thread snapshot into `data/raw/<threadid>.txt`
5. run `node src/index.js parse-thread <thread-url> <file>`

## Current parser fields
- title
- askingPrice
- currency
- location
- condition
- payment
- shipping
