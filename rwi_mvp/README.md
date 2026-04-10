# RWI MVP

Local MVP for parsing Replica Watch Info sales threads.

## What it does
- stores raw thread text under `data/raw/`
- extracts a few structured fields into `data/rwi.json`
- supports a simple `parse-thread` command

## Next step
Wire browser capture to save thread DOM/text into `data/raw/*.txt`, then run:

```bash
node src/index.js parse-thread <thread-url> <file>
```

## Current parser fields
- title
- askingPrice
- currency
- location
- condition
- payment
- shipping
