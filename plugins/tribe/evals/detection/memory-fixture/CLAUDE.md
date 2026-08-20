# orderly — project notes

Run `bun test` before opening a pull request. Keep functions short and give them one clear job.

## Release process
We cut a release every other Friday. Tag the commit, then post the changelog link in the team
channel. On-call rotates weekly; look at the roster before paging anyone.

## History
This tool replaced a spreadsheet the fulfillment team used to track orders by hand. The
original spreadsheet caused a bad afternoon in March when two people edited it at once and
overwrote each other's changes — that's the whole story of why this exists.

## Reviewing pull requests
Read the whole diff before commenting. Prefer asking a question over demanding a change when
you are not sure. Small pull requests get reviewed faster than large ones.
