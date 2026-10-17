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
- **The real screen, first pass** (alpine cartoon, ported from the approved prototype):
  - `src/scene.ts`: the canvas mountain, Ueli, follow-cam, weather, goats, and every feature's moment (gondola, avalanche, echo, föhn, fall, Barry's rescue), hidden blooms bursting as he reaches them, the win stamp.
  - `src/director.ts`: stages a book event by event; cosmetic choices are seeded from the book id.
  - `src/sound.ts`: synthesized sound, one mute (review [107]).
  - The deck: difficulty, the window dragged on the mountain with ◀ ▶ and arrow keys as backup, stake, Climb (space bar, review [228]); no scrolling at any size (review [227]); checked at 1280×720, 425×812 and 400×225.
  - A resumed round shows where it ended instantly; QA probes stage rounds instantly (`game.state.instant`).
- **Fixtures:** `fixtures/books.json`, with 3 losses and 3 wins for each of the 92 modes from the math's `export_fixtures.py`, simulated in-process.

## Next
1. Settle the open questions in `docs/GAME_DESIGN.md`, the mode count first.
2. Run the math's `run.py` (optimizer) and check `stats.py`. Then export fixtures from the published books, so every kind of round (rescue, golden bloom) is covered.
3. Add the rules screen (from the exported numbers), autoplay (with a confirmation step) and turbo, and replay polish. Then run `engine-review-prompt.md`.
4. Portrait phones: frame the ridge larger in the overview; the follow-cam is fine.

## Open questions
See `docs/GAME_DESIGN.md`, Open questions.
