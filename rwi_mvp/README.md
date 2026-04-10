# RWI MVP

Local MVP for parsing Replica Watch Info sales threads.

## What it does
- stores raw thread text under `data/raw/`
- extracts a few structured fields into `data/rwi.json`
- supports a simple `parse-thread` command

## Flow
1. use OpenClaw browser snapshot on a thread page
2. save the snapshot text into `data/raw/<threadid>.txt`
3. run `node src/index.js parse-thread <thread-url> <file>`

## Current parser fields
- title
- askingPrice
- currency
- location
- condition
- payment
- shipping
