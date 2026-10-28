# Edelweiss Edge (working title)

Published by **Copperwick Studios**.

An alpine climbing game for Stake Engine. Ueli, a yodeler with an alphorn, climbs a 25-step ridge in three climbs. Before he sets off you place a window on the ridge, and you win if he stops inside it. The higher the window, the rarer the stop and the bigger the pay. Gondola lifts, avalanches, alphorn echoes and the föhn wind move him along the way. Edelweiss blooms multiply the win, and past step 25 he goes over the edge. The repo was set up from Thunder Push's.

- Design: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- Status: [docs/STATUS.md](docs/STATUS.md)
- Math: [CopperwickStudios/game-math](https://github.com/CopperwickStudios/game-math) (`games/edelweiss_edge/`)

## Run
```bash
npm install
npm run dev
```
Open http://localhost:5200. Sweet Push uses 5173, High Noon Push 5180 and Thunder Push 5190, so they can all run at once. `--host` is on, so you can open it from your phone on the same Wi-Fi using the network URL Vite prints.

`npm run build` makes the demo build (`dist/`). `npm run build:stake` makes the Stake upload (`dist-stake/`).

The screen is the alpine-cartoon mountain on a canvas: pick a difficulty, drag the sign over your window along the ridge (or tap its arrows), and Climb. The menu holds sound, turbo and the rules. Every round is staged from its book.
