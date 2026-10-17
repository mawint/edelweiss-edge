# Edelweiss Edge (working title)

An alpine climbing game for Stake Engine. Ueli, a yodeler with an alphorn, climbs a 25-step ridge in three climbs. Before he sets off you place a window on the ridge, and you win if he stops inside it. The higher the window, the rarer the stop and the bigger the pay. Gondola lifts, avalanches, alphorn echoes and the föhn wind move him along the way. Edelweiss blooms multiply the win, and past step 25 he goes over the edge. The repo was set up from Thunder Push's.

- Design: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- Status: [docs/STATUS.md](docs/STATUS.md)
- Math: mawint/edelweiss-edge-math

## Run
```bash
npm install
npm run dev
```
Open http://localhost:5200. Sweet Push uses 5173, High Noon Push 5180 and Thunder Push 5190, so they can all run at once. `--host` is on, so you can open it from your phone on the same Wi-Fi using the network URL Vite prints.

`npm run build` makes the hosted demo (`dist/`). `npm run build:stake` makes the Stake upload (`dist-stake/`).

The screen is a placeholder until the art style is chosen: the ridge's 26 steps, a difficulty, a window slider and Climb.

The hosted demo (Netlify) sits behind a shared password. It's read from the `SITE_PASSWORD` environment variable in the Netlify project, and the site stays shut until it's set.
