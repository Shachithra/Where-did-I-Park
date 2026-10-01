# WhereDidIPark?

**Park. Save. Find.**

A small, mobile-first web utility that saves where you parked and walks you back to it with Google Maps. No accounts, no backend. Your location stays in your browser.

## Features (V1)

- Save your current GPS position (latitude, longitude, accuracy). It keeps refining for a few seconds to get the best fix.
- Optional level, parking spot/bay and a short note, added from a bottom sheet
- Live "parked for" timer with fixed-width digits
- **Take me there** opens Google Maps walking directions
- Edit details, update the location (with confirmation), or clear it (custom sheet, no `confirm()`)
- Complete state handling: permission prompt, locating, locked, saved, blocked, unavailable, timed out, insecure origin and storage blocked
- Installable PWA with an offline app shell
- Supports reduced motion, keyboard use and screen readers

## Structure

```
index.html
css/  style.css · animations.css · responsive.css
js/   app.js (controller) · location.js · storage.js · timer.js · maps.js · ui.js
assets/icons/  icon.svg · icon-192/512.png · maskable-512.png · apple-touch-icon.png
manifest.json · sw.js
```

The site is plain HTML, CSS and vanilla JS (ES modules), with no build step.

## Run locally

ES modules, the service worker and geolocation all need `http://localhost` or HTTPS. They will not work from `file://`.

```bash
# any static server works
npx serve .
# or
python -m http.server 8080
```

Then open http://localhost:8080.

To test on a phone, deploy it (below) or use an HTTPS tunnel. Geolocation is blocked on plain `http://` LAN addresses.

## Deploy

- **GitHub Pages:** go to Settings → Pages → Deploy from branch → `main` / root.
- **Netlify / Vercel:** import the repo. There is no build command, and the publish directory is `/`.

All paths are relative, so it works from a sub-path such as `username.github.io/Where-did-I-Park/`.

When you change any shell file, bump `VERSION` in `sw.js` so installed copies update.

## Data

Stored in `localStorage` under `whereDidIPark.parkingSpot`:

```json
{ "latitude": 6.927079, "longitude": 79.861244, "accuracy": 8,
  "level": "03", "spot": "B12", "note": "Near the elevator", "parkedAt": 1790790000000 }
```

## Design

The visual concept combines parking signage, an automotive dashboard and a navigation utility. It uses a warm off-white background (`#F4F3EF`) and signage yellow (`#F4C430`). The type is Barlow Condensed for signage and figures, and Inter for the UI. Hierarchy comes from thin separators rather than cards, and each screen has one primary action.

Icons are from [Lucide](https://lucide.dev) (ISC licence), inlined as an SVG sprite.
