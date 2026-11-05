/* Habitat landing. Choosing a habitat in the menu plays a cinematic dive (earth-dive.js) from the
   globe to a real place for that habitat. Every dive ends inside a real, openly licensed photograph
   of that place, its horizon matched to the 3D horizon: the Danum Valley, Ningaloo Reef, the
   Okavango Delta, Punta Espinosa on Fernandina, and the Serengeti. There a slider runs the photo
   through habitat-specific human impacts (pollution-scenes.js, pollution-renderer.js). After the landing
   the page carries on into that habitat's chapter: what lives there, and its animals. */
(() => {
    'use strict';
    const canvas = document.getElementById('earth-canvas');
    if (!canvas || !window.earthView || !window.createEarthDive) return;

    const IMAGERY = 'Satellite: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0)';
    const TERRAIN = 'Elevation: Terrain Tiles on AWS Open Data';
    // Each site: target coordinates, approach bearing (degrees from north), where the camera ends,
    // the cloud deck it flies through (metres), and the chapter text.
    const SITES = {
        forest: {
            lat: 4.9645, lng: 117.8028, heading: 250,
            endAltitude: 320, cloudBase: 1800, cloudTop: 3400, cloudCover: .2, cloudBank: .7,
            label: 'Forest',
            title: 'Danum Valley, Borneo',
            place: 'Lowland dipterocarp rainforest in Sabah, Malaysia: home of the helmeted hornbill and the Bornean orangutan.',
            credit: `Photo: Gido (CC BY 2.0) · ${IMAGERY} · ${TERRAIN}`,
            photo: { src: 'images/habitats/forest/danum-canopy.jpg', focusY: .52 },
            alt: 'Unbroken primary rainforest canopy rolling away to forested hills in the Danum Valley.',
        },
        ocean: {
            // The lagoon at the photo's own place, north of Coral Bay. Sentinel-2 cloudless covers land
            // and coastal water only, so the site is a fringing reef right at the shore.
            lat: -22.7714, lng: 113.7681, heading: 255,
            endAltitude: 120, cloudBase: 1800, cloudTop: 3200, cloudCover: .14, cloudBank: .55,
            label: 'Ocean',
            title: 'Ningaloo Reef, Western Australia',
            place: 'A fringing coral reef that runs close to the shore for about 300 km, where whale sharks gather each year.',
            credit: `Photo: W. Bulach (CC BY-SA 4.0) · ${IMAGERY} · ${TERRAIN}`,
            photo: { src: 'images/habitats/ocean/ningaloo-lagoon.jpg', focusY: .262 },
            alt: 'Coastal scrub and a white beach above a turquoise lagoon, with waves breaking on the reef crest offshore.',
        },
        freshwater: {
            lat: -19.3, lng: 22.9, heading: 35,
            endAltitude: 260, cloudBase: 1900, cloudTop: 3300, cloudCover: .12, cloudBank: .5,
            label: 'Freshwater',
            title: 'Okavango Delta, Botswana',
            place: 'An inland delta where the Okavango River spreads across the Kalahari and never reaches the sea, flooding a maze of channels and islands each year.',
            credit: `Photo: Diego Delso, delso.photo (CC BY-SA 4.0) · ${IMAGERY} · ${TERRAIN}`,
            photo: { src: 'images/habitats/freshwater/okavango-floodplain.jpg', focusY: .322 },
            alt: 'Flooded grassland and blue lagoons around a small wooded island, stretching flat to the horizon.',
        },
        island: {
            // Punta Espinosa, looking east across the Bolívar Channel to Isabela.
            lat: -.2655, lng: -91.4405, heading: 95,
            endAltitude: 90, cloudBase: 1700, cloudTop: 3000, cloudCover: .26, cloudBank: .6,
            label: 'Island',
            title: 'Fernandina, Galápagos',
            place: 'The youngest and most volcanically active of the Galápagos Islands, where marine iguanas and flightless cormorants live on fresh lava shores.',
            credit: `Photo: Andrew Turner (CC BY 2.0) · ${IMAGERY} · ${TERRAIN}`,
            photo: { src: 'images/habitats/island/fernandina-shore.jpg', focusY: .283 },
            alt: 'Black lava and tide pools at Punta Espinosa, with sea lions on the rocks and the volcanoes of Isabela across the water.',
        },
        grassland: {
            // Where the photo was taken from a balloon, over the central Serengeti.
            lat: -2.6751, lng: 34.7269, heading: 320,
            endAltitude: 220, cloudBase: 1900, cloudTop: 3400, cloudCover: .3, cloudBank: .6,
            label: 'Grassland',
            title: 'Serengeti, Tanzania',
            place: 'Open plains in northern Tanzania crossed each year by the great wildebeest migration.',
            credit: `Photo: Harvey Barrison (CC BY-SA 2.0) · ${IMAGERY} · ${TERRAIN}`,
            photo: { src: 'images/habitats/grassland/serengeti-plains.jpg', focusY: .383 },
            alt: 'Golden grass plains with scattered acacia trees and low wooded hills, seen from a balloon in the early morning.',
        }
    };

    // Both entry points use the same human-impact narrative and imagery.
    for (const [key, scene] of Object.entries(window.pollutionScenes)) {
        SITES[key].loss = scene.stages;
        SITES[key].lossLabel = scene.pressure;
    }
    const dive = createEarthDive({ earthView });
    if (!dive.supported) return;

    // ---- Destination photograph (forest) ------------------------------------------------------
    const view = document.createElement('div');
    view.className = 'habitat-view is-visible';
    view.setAttribute('role', 'img');
    view.innerHTML = '<div class="habitat-view__look"><div class="habitat-view__drift"><div class="habitat-view__image"></div></div></div>';
    const photoLayer = view.querySelector('.habitat-view__image');
    const ready = image => image && image.complete && image.naturalWidth > 0;

    // Fit a photo to cover its layer with its horizon as near a screen height as the crop allows.
    function placePhoto(photo, screenY) {
        const image = photo.image;
        if (!ready(image)) return;
        const w = photoLayer.offsetWidth, h = photoLayer.offsetHeight;
        const inset = (h - innerHeight) / 2, targetY = screenY + inset;
        const k = Math.max(w / image.naturalWidth, h / image.naturalHeight);
        const iw = image.naturalWidth * k, ih = image.naturalHeight * k;
        const top = Math.max(h - ih, Math.min(0, targetY - photo.focusY * ih));
        photoLayer.style.backgroundSize = `${iw}px ${ih}px`;
        photoLayer.style.backgroundPosition = `${(w - iw) / 2}px ${top}px`;
        photoLayer.style.transformOrigin = `50% ${top + photo.focusY * ih}px`;
        photo.horizon = (top + photo.focusY * ih - inset) / innerHeight;
        photo.fit = [(w - iw) / 2, top, iw, ih, w, h];
    }
    let site = null, loss = null, landed = false, player = null, lossRequest = 0;
    function layoutPhoto() {
        if (!site || !site.photo) return;
        placePhoto(site.photo, innerHeight * .46);
        if (loss && site.photo.fit) loss.fit(...site.photo.fit, 1);
    }
    function loadPhoto(photo) {
        if (!photo.image) { photo.image = new Image(); photo.image.src = photo.src; }
        return photo.image.decode().catch(() => {});
    }

    // ---- Chapter after the landing ------------------------------------------------------------
    let animals = null;
    const animalData = () => animals || (animals = fetch('images/animals/animal-locations.json')
        .then(response => response.ok ? response.json() : []).catch(() => []));
    const distance = (a, b) => {
        const r = Math.PI / 180;
        return Math.acos(Math.max(-1, Math.min(1, Math.sin(a.lat * r) * Math.sin(b.lat * r) +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lng - b.lng) * r))));
    };
    function chapter(habitat, s) {
        const article = document.createElement('article');
        article.className = 'dive-chapter';
        article.innerHTML =
            '<section class="dive-chapter__intro">' +
                '<p class="habitat-caption__label"></p><h2 class="habitat-caption__title"></h2>' +
                '<p class="habitat-caption__place"></p>' +
                '<div class="habitat-loss" hidden>' +
                    '<p class="habitat-loss__context">Human-impact illustration · not recorded damage at this site</p>' +
                    '<label class="habitat-loss__label" for="habitat-loss"><span class="habitat-loss__name"></span> <output class="habitat-loss__stage" for="habitat-loss"></output></label>' +
                    '<input type="range" id="habitat-loss" class="habitat-loss__range" min="0" max="100" step="0.1" value="0" disabled aria-describedby="loss-context">' +
                    '<p class="habitat-loss__note"></p>' +
                    '<div class="habitat-loss__actions"><button type="button" class="loss-play" disabled>Play impact</button><button type="button" class="loss-reset" disabled>Reset view</button><button type="button" class="loss-retry" hidden>Retry images</button></div>' +
                    '<p class="habitat-loss__context" id="loss-context">Illustrative human-impact scenario. The altered image does not document damage at this location. The slider shows a visual sequence, not a measured pollution level.</p>' +
                    '<p class="habitat-loss__status" role="status"></p>' +
                '</div>' +
                '<p class="habitat-caption__note"></p>' +
                '<div class="dive-chapter__actions"><button type="button" class="habitat-caption__back">Back to space</button></div>' +
            '</section>' +
            '<section class="dive-chapter__animals" aria-labelledby="dive-animals-title">' +
                '<h3 id="dive-animals-title">Who lives in this habitat</h3><ul></ul>' +
            '</section>';
        article.querySelector('.habitat-caption__label').textContent = s.label;
        article.querySelector('.habitat-caption__title').textContent = s.title;
        article.querySelector('.habitat-caption__place').textContent = s.place;
        article.querySelector('.habitat-caption__note').textContent = s.credit + ' · ' + pollutionScenes[habitat].credit;
        article.querySelector('.habitat-loss__name').textContent = s.lossLabel || 'Habitat loss';
        article.querySelector('.habitat-caption__back').addEventListener('click', () => dive.exit());
        const range = article.querySelector('.habitat-loss__range');
        range.addEventListener('input', () => player?.set(range.value / 100));
        article.querySelector('.loss-play').addEventListener('click', () => player?.toggle());
        article.querySelector('.loss-reset').addEventListener('click', () => player?.set(0));
        article.querySelector('.loss-retry').addEventListener('click', enableLoss);
        const list = article.querySelector('.dive-chapter__animals ul');
        animalData().then(all => {
            const here = all.filter(a => (a.habitats || []).includes(habitat))
                .sort((a, b) => distance(a, s) - distance(b, s)).slice(0, 8);
            list.replaceChildren(...here.map(a => {
                const li = document.createElement('li');
                li.className = 'dive-animal';
                li.innerHTML = '<img alt="" loading="lazy"><div><strong></strong><span></span></div>';
                li.querySelector('img').src = a.image;
                li.querySelector('img').alt = a.name;
                li.querySelector('strong').textContent = a.name;
                li.querySelector('span').textContent = a.place + ', ' + a.country;
                return li;
            }));
            if (!here.length) article.querySelector('.dive-chapter__animals').hidden = true;
        });
        return article;
    }
    let content = null;
    function setLoss(value) {
        if (!site || !site.loss || !content) return;
        const box = content.querySelector('.habitat-loss');
        const stage = site.loss.filter(s => value >= s[0]).pop();
        box.querySelector('.habitat-loss__stage').textContent = stage[1];
        box.querySelector('.habitat-loss__note').textContent = stage[2];
        const range = box.querySelector('.habitat-loss__range');
        range.value = value * 100;
        range.setAttribute('aria-valuetext', stage[1]);
        view.setAttribute('aria-label', `${site.alt} ${value > 0 ? 'Illustrative human impact: ' + stage[1] + '. ' + stage[2] : ''}`);
        if (loss) loss.set(value);
    }
    async function enableLoss() {
        if (!site.loss || !ready(site.photo.image) || !window.habitatLoss) return;
        const request = ++lossRequest, selected = current;
        const box = content.querySelector('.habitat-loss');
        box.hidden = false;
        box.querySelector('.loss-retry').hidden = true;
        box.querySelector('.habitat-loss__status').textContent = 'Loading the human-impact scene…';
        try {
            const next = await habitatLoss.create(selected, photoLayer, site.photo.image);
            if (request !== lossRequest || selected !== current || !landed) { next.destroy(); return; }
            loss?.destroy(); loss = next;
            player?.destroy();
            player = habitatLoss.playback(setLoss, playing => {
                box.querySelector('.loss-play').textContent = playing ? 'Pause impact' : 'Play impact';
                box.querySelector('.loss-play').setAttribute('aria-pressed', String(playing));
            });
            box.querySelectorAll('input, .loss-play, .loss-reset').forEach(control => control.disabled = false);
            box.querySelector('.habitat-loss__status').textContent = '';
            layoutPhoto(); setLoss(0);
        } catch (error) {
            if (request !== lossRequest || selected !== current) return;
            box.querySelector('.habitat-loss__status').textContent = 'The impact scene could not load. The original photograph remains available.';
            box.querySelector('.loss-retry').hidden = false;
        }
    }

    // ---- Sequence ------------------------------------------------------------------------------
    let current = '';
    async function land(habitat) {
        const s = SITES[habitat];
        if (!s) { if (dive.isActive()) dive.exit(); return; }
        if (dive.isActive() && current === habitat) return;
        if (dive.isActive()) dive.exit({ immediate: true });
        resetPhoto();
        current = habitat;
        site = s;
        landed = false;
        // The menu folds away so the flight has the whole screen.
        const header = document.getElementById('site-header');
        if (header && header.classList.contains('has-toggle') && !header.classList.contains('is-collapsed'))
            header.querySelector('.nav-toggle')?.click();
        let scene = null;
        if (s.photo) {
            await Promise.race([loadPhoto(s.photo), new Promise(r => setTimeout(r, 2500))]);
            if (current !== habitat) return;
            photoLayer.style.backgroundImage = `url("${s.photo.src}")`;
            view.setAttribute('aria-label', s.alt);
            photoLayer.style.transform = 'scale(1.24)';
            scene = {
                element: view,
                update(t) {
                    // The photo keeps moving forward at the pace the camera was flying, then settles.
                    const e = 1 - Math.pow(1 - t, 3);
                    photoLayer.style.transform = `scale(${(1 + .24 * (1 - e)).toFixed(4)})`;
                    if (t >= 1 && !landed) { landed = true; enableLoss(); }
                    // Flying back up leaves the valley as it was.
                    else if (t < .98 && landed) { landed = false; player?.set(0); setLoss(0); }
                },
                leave() { resetPhoto(); }
            };
        }
        content = chapter(habitat, s);
        const started = dive.enter({
            lat: s.lat, lng: s.lng, heading: s.heading, endAltitude: s.endAltitude, endPitch: s.endPitch,
            cloudBase: s.cloudBase, cloudTop: s.cloudTop, cloudCover: s.cloudCover, cloudBank: s.cloudBank,
            scene: !!s.photo,
            horizon: s.photo ? () => { layoutPhoto(); return s.photo.horizon ?? .5; } : null
        }, {
            scene, content,
            onExit: () => { current = ''; site = null; }
        });
        if (started && s.photo) layoutPhoto();
    }
    function resetPhoto() {
        ++lossRequest;
        player?.destroy(); player = null;
        if (loss) { loss.destroy(); loss = null; }
        photoLayer.style.transform = '';
        landed = false;
    }

    document.addEventListener('habitatchoose', event => land(event.detail.habitat));
    canvas.addEventListener('earthhome', () => { if (dive.isActive()) dive.exit({ immediate: true }); });
    addEventListener('resize', () => { if (dive.isActive()) layoutPhoto(); });
})();
