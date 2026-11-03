# Last Light

A complete, single-page arcade survival game. Collect the warm sparks, avoid the red void-orbs, and see how long you can keep your light alive.

## Play

Open `index.html` in a modern browser, or serve this folder with any static web server. No build step or dependencies are required.

- **Move:** arrow keys or **WASD**; on touchscreens, tap or drag in the playfield. Mouse movement also steers.
- **Dash:** **Space** (three-second recharge; briefly grants a speed burst and protection).
- **Pause / resume:** **P** or **Escape**.
- **Sound:** toggle in the top-right corner. The game uses small synthesized effects and stores your best score in browser local storage.

Collect sparks for points. Red hazards cost one of your three shields. The hazards get more frequent and faster as a run goes on.

## Configuration report

- **Project type:** dependency-free HTML, CSS, and vanilla JavaScript browser game; `index.html` is the entry point.
- **Rendering:** responsive Canvas 2D game field, scaled for high-density screens. It does not require WebGL or a server-side runtime.
- **Controls:** keyboard plus mouse/touch pointer steering; pause and dash are keyboard actions.
- **Persistence:** best score is saved under `lastLightBest` in `localStorage`; all active run state is in memory.
- **Audio:** optional Web Audio API synth effects, activated after the first user interaction. Sound can be disabled.
- **External services:** Google Fonts are requested for the display and mono typefaces; system font fallbacks are provided. Gameplay itself works offline after the files are available.
- **Assumption:** “configuration” was interpreted as a brief report of the game's implementation/runtime setup, while the rest of the request was to deliver the playable game.
