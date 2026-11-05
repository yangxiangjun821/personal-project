# Changelog

All notable changes to Vanishing Wild. Dates are YYYY-MM-DD.

## [Unreleased] - 2026-11-05

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
