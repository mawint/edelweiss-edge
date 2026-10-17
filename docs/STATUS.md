# Status

Last updated October 17, 2026.

## Done
- **Repos set up** from Thunder Push's (thunder-push and thunder-push-math): the RGS client, mock RGS, fixtures pipeline, QA harness (Chrome client, static server, build-ref), Netlify demo gate and CI. All Thunder Push code, art, copy and math has been removed.
- **Math, second pass** (`edelweiss-edge-math`, `games/edelweiss_edge/`):
  - the stop is drawn first from height-based weights, so pay rises toward the edge;
  - stories with calibrated features act it out;
  - blooms are independent of the stop;
  - 92 bet modes, books, optimizer targets and tests.
  See `readme.txt` there. The first pass's 1,000-paths model was replaced.
- **Placeholder screen:** the 26-step ridge, the difficulty buttons, the window slider and Climb. It plays real books through the RGS (or the mock) and stages each event as a line of text. Blooms appear on the ridge as he reaches them.
- **Fixtures:** `fixtures/books.json`, with 3 losses and 3 wins for each of the 92 modes from the math's `export_fixtures.py`, simulated in-process.

## Next
1. Settle the open questions in `docs/GAME_DESIGN.md`, the mode count first.
2. Run the math's `run.py` (optimizer) and check `stats.py`. Then export fixtures from the published books, so every kind of round (rescue, golden bloom) is covered.
3. Choose the art style. Then build the real ridge, Ueli, each feature's moment and the blooms.
4. Add the rules screen (from the exported numbers), sound, autoplay and turbo, and replay polish. Then run the Stake build and `engine-review-prompt.md`.

## Open questions
See `docs/GAME_DESIGN.md`, Open questions.
