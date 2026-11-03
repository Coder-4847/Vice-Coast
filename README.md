# Vice Coast

A cinematic open-world crime game for the browser, built with Three.js, TypeScript and Vite.

**Live:** https://coder-4847.github.io/Vice-Coast/

## Status

Phase 1 (Foundation): game loop, input (keyboard + mouse, gamepad, touch), settings, quality presets, GitHub Pages deploy. The world is a placeholder test scene.

## Controls

| Action | Keyboard + mouse | Controller | Touch |
| --- | --- | --- | --- |
| Move | WASD | Left stick | Left stick |
| Look | Mouse (click canvas to capture) | Right stick | Right stick |
| Sprint | Shift | L3 | Push stick fully |
| Jump | Space | A / Cross | Jump button |
| Settings | Esc or P | Start | — |
| FPS counter | F3 | — | — |

## Run locally

```
npm install
npm run dev
```

Production build: `npm run build` (output in `dist/`).

## Deploy

Every push to `main` builds with Vite and deploys through the GitHub Actions workflow in `.github/workflows/deploy.yml`.
