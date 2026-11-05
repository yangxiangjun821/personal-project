# Vanishing Wild

Open index.html with VS Code Live Server so the shared navigation and footer can load through fetch.

## Coursework

The site introduces endangered animals, their habitats, and conservation pressures. It is a single page, index.html: the Animals and Habitats menu items open the animal list and the habitat dives on the globe. project.html is no longer linked from the site; it holds the 100-species animal profiles that the home page reads, plus five project ideas and their audiences.

## Publication

Once the live address is known, add absolute HTTPS og:image and og:url meta tags to index.html. Do not invent a domain.

Create a GitHub repository, enable two-factor authentication, and push the local history. Commit future improvements as they happen; the first snapshot is not a reconstruction of past work.

## Interactive Earth homepage

The homepage renders a textured 3D sphere and a drifting, twinkling starfield with native WebGL and local assets, without a CDN or build step. The canvas fills the whole hero; the globe's radius at 100% zoom is 45% of the smaller canvas dimension. Drag to rotate, scroll or pinch to zoom, or use the zoom and reset buttons. Focus the globe and use arrow keys, + / -, and Home for keyboard control. Canvas keyboard focus underlines the help text instead of outlining the canvas; buttons retain visible focus rings. WebGL and asset errors show a recovery message.

Pause stars / Play stars controls the background animation. Reduced-motion preferences default to static stars, and the globe does not rotate automatically. Animated stars render at approximately 30fps only while the canvas is onscreen and the document is visible. When paused, rendering becomes demand-driven for interactions and layout or visibility changes.

`earth.js` exposes `window.earthView.project(latitude, longitude)` for future animal markers. Pass degrees; the result contains viewport-local CSS pixel coordinates and `visible` (front hemisphere). Listen for `earthviewchange` on `#earth-canvas` to reposition markers on resize, zoom, or rotation. No animal locations are plotted in this phase. Texture provenance is in `images/earth/PROVENANCE.md`.

## Combined Home and Animals entry

The menu no longer lists a separate Home link: the "Vanishing Wild" home page covers it. The heading and the animal markers appear together when the page loads. Dragging or zooming the globe fades the heading out and moves the Earth to the centre of the screen. Hovering (or focusing) a marker shows a profile card with the animal's photo, conservation status, Latin name, signature feature, place and coordinates; clicking a marker opens the full profile panel, while the globe slowly turns that animal to face the viewer and glides so the marker settles in the middle of the free space beside the panel (left of it on wide screens, above it on narrow ones), zooming in on it. Closing the profile (the close button, Esc, clicking the marker again or clicking empty space) flies back to the view from before the click. Dragging the globe instead closes the profile and eases the zoom part of the way out, leaving the globe where it was dragged. On the home page the logo and Reset view ease the Earth back to its opening view, with the heading and markers.

## Animal list on the home page

The menu's Animals item sits above Habitats. It opens an animal list: the Earth flies to a random point on the planet, zooms in, and sinks into the bottom-right quarter of the screen. There it becomes a locked backdrop that ignores drag, wheel, pinch and keyboard input, while the starfield keeps moving. The 100 field-guide cards then fade in one after another, and more appear as the list scrolls. Card text is read from project.html; photos come from animal-images.js. Back to Earth, Escape, Animals again, the logo, or opening the Habitats menu closes the list and returns the globe to its opening view.

## Cinematic habitat dive

Choosing a habitat in the home page menu (Habitats → Forest, Ocean, Freshwater, Island or Grassland) plays an automatic camera flight, about 8 seconds long, from the Earth in space down to a real place for that habitat. No scrolling is needed. The mouse wheel and touch are ignored during the flight. The flight has four stages, shown on the rail at the right:

1. **Space (0–20%)**: the whole Earth with real satellite colour, clouds, atmosphere glow and day/night shading, with a gentle handheld drift. The flight starts from exactly the globe that was on screen, so there is no visible jump.
2. **Orbit (20–40%)**: the camera swings round so the destination comes to the centre, and the lens widens as it closes in (a dolly-zoom).
3. **Descent (40–75%)**: the dive, accelerating and then slowing down (eased in log-altitude). The planet's curvature flattens into ground, satellite detail sharpens from 20 km to about 10 m per pixel, and the camera punches through a cumulus deck. Motion blur radiates from the real direction of travel, with edge defocus at speed.
4. **Arrival (75–100%)**: the camera levels out over real terrain and flies into mist that parts onto a real photograph of the place, its horizon matched to the 3D horizon. After landing, the habitat's chapter slides up by itself: description, a pollution slider, and nearby animals from the field guide. The chapter is ordinary content and can be scrolled.

Each slider shows one kind of pollution that people cause in that habitat, so no two habitats repeat:

| Habitat | Destination photograph | Pollution | What the slider shows |
| --- | --- | --- | --- |
| Forest | Danum Valley, Borneo, from a canopy tower | Logging and smoke | Logging roads, machinery, stacked timber, clearings and smoke from slash burning |
| Ocean | Ningaloo Reef lagoon, north of Coral Bay | Sediment | A dredging vessel, its spreading sediment plume and murky shallows |
| Freshwater | Okavango Delta from the air | Wastewater and nutrient runoff | Cultivated land and a drain, polluted discharge, algal mats and plastic trapped in reeds |
| Island | Lava shore at Punta Espinosa, Fernandina | Fishing waste and fuel | A leaking vessel, oil film in tide pools and discarded nets, rope and packaging |
| Grassland | Central Serengeti from a balloon | Land conversion and dumping | Road access, vehicle dust, fenced cultivation, exposed soil and a roadside rubbish dump |

The slider controls a progressive photographic reveal, with optional play/pause; it is not a physical fluid or ecological simulation. Activity sources appear first and wider consequences later. The chapter describes the corresponding human pressure without claiming these alterations happened at the named location. Play runs only after a user action, and resetting or switching habitats stops playback and releases the previous image renderer.

"Back to space", Escape, or the chapter's button play the flight backwards automatically and hand back to the home globe. The logo leaves at once.

### How it is built

The site has no build step and no dependencies, and the home globe is a hand-written WebGL renderer, so the dive is written the same way: native WebGL 1, no Three.js, React, GSAP or CesiumJS. Adding those would have meant introducing npm, a bundler and roughly 4–30 MB of libraries to a static coursework site. The parts they would have provided are implemented directly:

- **Camera and globe**: a true perspective camera in an Earth-centred frame (1 unit = Earth's radius). The sphere is ray-traced, so curvature is exact at every altitude. Camera position is computed in double precision on the CPU and sent to the GPU relative to the target, which keeps ground detail stable a few hundred metres up.
- **Imagery**: a clipmap of six Sentinel-2 cloudless texture levels (the world at zoom 3, then zoom 6, 8, 10, 12 and 14 centred on the target), streamed tile by tile, nearest first. It never magnifies a low-resolution texture endlessly: each level fades in as it loads.
- **Terrain**: real elevation (zoom 11, about 76 m per pixel) built into a 255 × 255 vertex mesh around the target (161 × 161 on phones), shaded with the same lighting as the globe. The camera keeps clear of the highest nearby ground.
- **Atmosphere**: single scattering with real Rayleigh and Mie coefficients, sunlight attenuated with a Chapman-function approximation, and aerial perspective on the ground and clouds.
- **Clouds**: a shaded cumulus layer with self-shadowing, and cloud shadows on the ground. A cumulus bank is placed where the flight path crosses the deck; flying through it, the cloud density at the camera becomes a wispy whiteout. Cloud noise comes from a small random texture (one read per octave), which keeps the shaders small enough for Direct3D to compile quickly.
- **Timeline**: one progress value (0–1) drives everything on screen. By default a timeline plays it (`autoplay`, `duration`). With `autoplay: false`, scrolling drives it instead, ScrollTrigger-style. Either way the camera eases towards it (`scrub`), and reversing retraces exactly the same path.
- **Post-processing**: motion blur from the focus of expansion, scaled by optical flow (speed ÷ height), plus edge defocus, vignette, grain and the mist dissolve. The canvas alpha reveals the destination photograph underneath.

### Files

- `earth-dive.js`: the reusable component, `createEarthDive(options)` → `{ enter(site, { scene, content, onExit }), exit(), destroy(), isActive(), progress() }`.
- `habitat-flight.js`: the five destinations, their photographs and the chapter content.
- `pollution-scenes.js`: shared activity sources, images, stage descriptions and protection actions.
- `pollution-renderer.js`: asynchronous `habitatLoss.create(kind, layer, image)` returns `{ fit(), set(value), stop(), destroy() }`; also provides image loading and explicit playback controls. The old `habitat-loss.js` and `forest-loss.js` shaders are retained but no longer loaded.
- `earth.css`: dive layout, HUD and chapter styles (the "Cinematic habitat dive" block).
- `earth.js`: one addition, `earthView.frame()`, which reports the globe as currently drawn so the dive can take over seamlessly.

### Configuration

`createEarthDive(options)`:

| Option | Default | Meaning |
|---|---|---|
| `autoplay` | `true` | The flight plays by itself; `false` makes scrolling drive it |
| `duration` | `8` | Seconds for the automatic flight, space to ground |
| `scrollLength` | `7` | Viewport heights of scrolling for the whole flight (only with `autoplay: false`) |
| `scrub` | `0.32` | Seconds the camera takes to catch up with its target |
| `imagery` | EOX Sentinel-2 cloudless | `{ url, maxZoom, attribution }`; any XYZ (Web Mercator) tile source with CORS |
| `terrain` | AWS Terrain Tiles | `{ url, zoom, attribution }` (terrarium encoding), or `null` for flat ground |
| `meshExtent` | `60000` | Metres of real terrain around the target |
| `exposure` | `0.18` | Overall brightness of the rendered scene |

Per destination (`enter(site, …)`): `lat`, `lng`, `heading` (approach bearing in degrees), `endAltitude` (metres above ground), `endPitch` (degrees from straight down; computed from the photo's horizon when `horizon()` is given), `cloudBase` and `cloudTop` (metres), `cloudCover` (0–1), `cloudBank` (strength of the cloud the camera passes through), and `scene` (true when a destination layer is revealed through the mist). `scene.update(t)` receives the arrival progress for continuing the forward motion in the photo.

### Performance

The shaders compile in the background (`KHR_parallel_shader_compile`), starting 1.2 s after the home page loads. Choosing a habitat before they are ready shows "Preparing the flight…" instead of blocking the page. This was the cause of an earlier freeze: on Windows (ANGLE/Direct3D 11), asking for a shader's status waits for the driver, and the first, much larger version of these shaders took over 90 s to compile.

Measured on Intel UHD Graphics (Direct3D 11) in Edge:

| Window | Frame rate | Worst main-thread stall during the flight |
|---|---|---|
| 1280 × 800 | 35–42 fps | 16 ms |
| 1920 × 1080 at 1.5× | about 30 fps | 3–8 ms |

60 fps needs a discrete GPU at these sizes.

- **Resolution**: scales dynamically between 40% and 85% on desktop (35–65% on phones), starting at 60%, driven by the measured frame time. A single very slow frame drops straight to the minimum. Device pixel ratio is capped at 1.25 (1 on phones).
- **Fallback**: if the frame rate stays very low, the component rebuilds its shaders once in a lighter tier (fewer atmosphere samples, smaller terrain mesh), in the background.
- **Drawing order**: once the terrain is fully in, it is drawn first, and the globe pass only shades the pixels it leaves uncovered. The destination photograph is only composited from the arrival onwards.
- **Main thread**: terrain decoding and mesh building run in slices of about 8 ms, and imagery mipmaps are rebuilt one level per frame, so streaming never stalls scrolling.
- **Idle**: rendering stops when the destination photograph has taken over or the tab is hidden.
- **Downloads**: tiles stream on demand, nearest first, with at most 10 requests in flight (6 on phones). A forest dive downloads about 300 imagery tiles and 64 elevation tiles (roughly 8–12 MB). The world level is shared between destinations.
- **Cleanup**: `destroy()` releases every texture, buffer, program and listener.
- **Reduced motion**: with `prefers-reduced-motion`, the drift, motion blur and grain are off.

### Data, limits and what is not faked

- **Imagery**: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0), about 10 m per pixel at best. It covers land and coastal water only, which is why the ocean destination is Ningaloo, a fringing reef at the shore; offshore reefs would show no real imagery.
- **Elevation**: Terrain Tiles on AWS Open Data. No token is needed for either service. Both are shown in the dive's credit line.
- **Clouds, atmosphere and stars**: procedural and illustrative, not weather data.
- **Ground photographs**: one openly licensed Wikimedia Commons photograph per habitat (credits in `CREDITS.md`, details in each `images/habitats/<habitat>/PROVENANCE.md`). The dive targets the photo's own location where the file records one (Ningaloo, Serengeti) or the named place (Punta Espinosa); the Okavango photo has no recorded position, so that dive targets the delta's interior.
- **Going further**: aerial video, panoramas or photogrammetric 3D cities need assets or services this project does not have. Options include Cesium ion (an access token, for Cesium World Terrain and Bing imagery), Google Photorealistic 3D Tiles (an API key and billing), or licensed drone footage per site. Any of these can be wired in through the `imagery`/`terrain` options or a destination `scene`.
