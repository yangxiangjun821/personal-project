# Changelog

All notable changes to Vanishing Wild. Dates are YYYY-MM-DD.

## 2026-11-09

### Added
- Filled `images/animals/animal-details.json` for all 100 species: IUCN assessment year, size, weight, lifespan, food, activity, social life, breeding and population figures, compiled from Wikipedia and the IUCN assessments it cites, with scope and year kept next to every number. Ecology, conservation actions and fun facts are still empty and show "No reliable data yet". An English copy lives in `images/animals/animal-details-en.json`.
- Species cards and detail page: cards show photo with credit, Chinese and English names, IUCN tag, range, a one-line hook and a "Learn more" button; the detail page (`animal-detail.js`, `animal-data.js`, Chinese text in `animal-detail-zh.js`) covers status, features, range map, behaviour, population, threats, ecology, conservation, actions, a fact and sources. Facts live in `images/animals/animal-details.json`; anything not hand-checked shows "No reliable data yet".
- English / 中文 language switch: a "Settings" item above "About" in the menu opens a language choice. `i18n.js` swaps page text and key attributes (including text added later by other scripts) using the dictionary in `i18n-zh.js`, remembers the choice in `localStorage`, and fades the page out and back in while switching. The about view and the field-guide page (`project.html`) switch too.
- "Learn more" button in the globe's animal panel opens the same detail page.

### Changed
- The animal list now builds its cards from `animal-data.js` instead of parsing `project.html`.
- Conservation status uses one two-part IUCN badge ("CR | Critically endangered") on the globe hover card, the animal panel, the list and the detail page, with shared `--status-cr/en/vu` colours.
- Globe markers lie flat on the surface: they squash and fade towards the edge of the globe and hide just before going round the back.
- Habitat dives no longer jump straight into the chapter after landing: the destination is shown whole first, and the first downward scroll, swipe or key opens the chapter. Scrolling back to the top shows the destination again.
- The Habitats sub-menu unfolds on hover and shares the menu handling with the new Settings menu (`nav.js`).
- Bumped the cache-busting versions of changed scripts and styles in `index.html`.

### Performance
- Animal list cards load 640px copies from `images/animals/thumbs/` (4.6 MB in total instead of 22.7 MB); the detail page still shows the full photos. A card falls back to the full photo if its copy is missing.
- While the globe sits behind the animal list or the about view, the starfield redraws at about 15 frames a second and 1x resolution instead of 30 and 1.5x, which keeps scrolling the list smooth on integrated graphics.

## 2026-11-05

### Added
- Interactive Earth homepage: a native WebGL textured 3D globe with a twinkling starfield, drag/scroll/pinch/keyboard control and no CDN or build step (`earth.js`, `earth.css`, `images/earth/`).
- Animal markers on the globe with hover cards and a full profile panel; the camera turns and glides to the selected animal and flies back on close (`earth-markers.js`, `animals.js`).
- Animal list opened from the Animals menu: the globe sinks into a locked backdrop and the 100 field-guide cards fade in and load progressively (`animal-list.js`, `animal-images.js`, `images/animals/`).
- Cinematic ~8-second habitat dives (Forest, Ocean, Freshwater, Island, Grassland) from space to a real place, with a four-stage progress rail (`earth-dive.js`, `habitat-flight.js`).
- Habitat chapters after landing: description, a per-habitat pollution/loss slider and nearby animals (`habitat-loss.js`, `forest-loss.js`, `pollution-renderer.js`, `pollution-scenes.js`, `ocean-scene.js`, `images/habitats/*`).
- Embedded about view (`about-view.js`).

### Changed
- Site is now a single page (`index.html`); navigation and footer reworked (`nav.html`, `nav.js`, `footer.html`).
- `project.html` is no longer linked; it remains as the data source for the 100 species profiles and project ideas.
- Restyled `style.css`; updated `README.md`, `DESIGN.md`, `CREDITS.md`, habitat `PROVENANCE.md` and animal photo credits.
- Updated `fetch-animal-images.ps1` for the new image layout.

### Removed
- Separate pages and assets replaced by the single-page experience: `about.html`, `contact.html`, `poster.html`, `quotes.html`, `habitats.html/.css/.js`, and the old line-art animal images.

## 2026-11-02
- Added the first interactive habitat change experience; removed the earlier `machine` pages.

## 2026-10-31
- Added the complete Vanishing Wild personal project and merged it with the existing GitHub history.

## 2026-10-14
- Updated `.gitignore`.
