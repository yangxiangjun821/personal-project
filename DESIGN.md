# Design System

## Direction

Vanishing Wild uses the visual language of an editorial conservation field guide: warm paper, forest surfaces, serif headlines, thin specimen dividers, and an amber signal colour.

## Palette

- Forest: `#183a2e`
- Moss: `#315f45`
- Field-paper background: `#f2f0e7`
- Amber signal: `#d59a3a`
- Ink: `#1e2d25`

## Layout

Content uses a broad 1120px reading frame. The homepage opens with an interactive textured WebGL globe and starfield on a canvas covering the entire hero, without a separate canvas rectangle. The hero background is near-black (`#030711`). At 100% zoom, the globe radius is 45% of the canvas's smaller dimension. Its centre sits at 63% across and 47% down on desktop, and 50% across and 61% down at widths up to 760px. A paper-coloured serif headline and an amber field-guide link sit beside the globe on desktop and above it on mobile, with text shadows and a directional gradient supporting readability. Bottom controls stack and wrap on smaller screens. Introductory content returns to the 1120px reading frame below. Internal pages favour open reading space and ruled field-guide rows that collapse to one column on smaller screens.

## Interaction

Controls have visible keyboard focus, and habitat filtering is the primary interaction. Selecting Ocean opens an immersive, procedurally rendered environment behind the filtered field-guide entries: the water remains alive in real time while scroll position carries the viewer from the surface into the sunlight zone. Other habitats retain the paper field-guide surface until their environments are designed. Reduced-motion visitors receive a stable underwater view instead of the scroll descent.

## Components

### Homepage globe

The globe extends the existing conservation field-guide visual system with a spherical, locally textured surface, directional light, and a restrained atmospheric rim against a drifting, twinkling starfield. Native WebGL in `earth.js` loads `images/earth/surface.jpg` and generates the stars procedurally; it needs no CDN or build step. Texture provenance is recorded in `images/earth/PROVENANCE.md`.

- Drag with a mouse or one finger to rotate; scroll or pinch with two fingers to zoom. The cursor changes from grab to grabbing during a drag.
- Focus the canvas to rotate with the arrow keys, zoom with + / −, and restore the initial view with Home. Visible zoom buttons and Reset view offer equivalent controls; the zoom readout runs from 70% to 280%, starting at 100%.
- Controls use thin borders, 4px corners, a minimum 44px target, and a visible amber focus outline. Canvas keyboard focus underlines the help text instead of drawing a rectangular outline around the hero. Loading and failure messages occupy the globe viewport; controls remain disabled until the texture is ready. A JavaScript-disabled message explains how to enable the interaction.
- Pause stars / Play stars toggles the drifting and twinkling background; reduced-motion preferences default to static stars. The globe has no automatic rotation. Star animation renders at approximately 30fps while the canvas is visible and the document is active; rendering stops offscreen or in a hidden document. With stars paused, rendering is demand-driven after interactions, loading, resizing, or visibility changes.
- Future animal markers can use `window.earthView.project(latitude, longitude)`, with coordinates in degrees, to obtain viewport-local CSS pixel positions and front-hemisphere visibility. Listen for `earthviewchange` on `#earth-canvas` to update marker placement after rotation, zoom, or resize. This is an integration point only: the current homepage does not plot animal locations.
