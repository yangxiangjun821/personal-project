/* Animal markers on the home-page Earth. They appear with the heading as soon as the page loads;
   dragging or zooming the globe fades the heading and centres the Earth (earth.js). Hovering (or focusing) a marker reveals a small card beside it, and clicking one opens
   the full profile panel on the right while the globe moves aside. */
(() => {
    'use strict';
    const canvas = document.getElementById('earth-canvas');
    if (!canvas || !window.earthView) return;

    const layer = document.createElement('div');
    layer.className = 'earth-markers';
    const card = document.createElement('div');
    card.className = 'earth-card';
    card.setAttribute('role', 'tooltip');
    card.id = 'earth-card';
    card.innerHTML = '<img alt=""><div><span class="earth-card__status"></span><strong></strong><em class="earth-card__latin"></em>' +
        '<span class="earth-card__feature"></span><span class="earth-card__place"></span></div>';
    layer.appendChild(card);
    document.querySelector('.earth-viewport').after(layer);

    const panel = document.createElement('aside');
    panel.className = 'animal-panel';
    panel.setAttribute('aria-labelledby', 'animal-panel-title');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = '<button type="button" class="animal-panel__close" aria-label="Close profile">✕</button>' +
        '<img class="animal-panel__image" alt="">' +
        '<div class="animal-panel__body">' +
            '<p class="animal-panel__meta"><span class="animal-panel__status"></span><span class="animal-panel__habitat"></span></p>' +
            '<h2 id="animal-panel-title"></h2><p class="animal-panel__scientific"></p>' +
            '<div class="animal-panel__facts"></div>' +
            '<p class="animal-panel__location"><span class="animal-panel__place"></span></p>' +
            '<button type="button" class="card-more animal-panel__more">Learn more</button>' +
        '</div>';
    layer.after(panel);

    let markers = [], active = null, selected = null, loading = null;

    // Profile text is reused from the animal field guide page, matched by name.
    const normalise = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
    const profiles = fetch('project.html')
        .then(response => response.ok ? response.text() : '')
        .then(html => {
            const map = new Map();
            new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.animal-profile').forEach(article => {
                const name = article.querySelector('h3');
                if (name) map.set(normalise(name.textContent), article);
            });
            return map;
        })
        .catch(() => new Map());

    function load() {
        if (!loading) loading = fetch('images/animals/animal-locations.json')
            .then(response => { if (!response.ok) throw new Error('Locations failed to load'); return response.json(); })
            .then(animals => {
                markers = animals.map((animal, index) => {
                    const marker = document.createElement('button');
                    marker.type = 'button';
                    marker.className = 'earth-marker';
                    marker.style.setProperty('--delay', (index * 45) + 'ms');
                    marker.setAttribute('aria-label', animal.name + ', ' + animal.place);
                    marker.setAttribute('aria-describedby', 'earth-card');
                    marker.innerHTML = '<span></span>';
                    marker.addEventListener('pointerenter', () => show(marker, animal));
                    marker.addEventListener('focus', () => show(marker, animal));
                    marker.addEventListener('pointerleave', hide);
                    marker.addEventListener('blur', hide);
                    marker.addEventListener('click', () => marker === selected ? deselect() : select(marker, animal));
                    // Markers sit above the canvas; pass wheel zoom through to it.
                    marker.addEventListener('wheel', event => {
                        event.preventDefault();
                        canvas.dispatchEvent(new WheelEvent('wheel', event));
                    }, { passive: false });
                    layer.insertBefore(marker, card);
                    return { marker, animal };
                });
                update();
            });
        return loading;
    }

    function update() {
        markers.forEach(({ marker, animal }) => {
            const point = earthView.project(animal.lat, animal.lng);
            // Lie flat on the surface: squash the dot along the radial direction as it nears the limb.
            const squash = Math.max(.2, Math.min(1, point.depth * 1.6));
            const angle = Math.atan2(point.ny, point.nx);
            marker.style.transform = `translate(${point.x}px, ${point.y}px) rotate(${angle}rad) scale(${squash}, 1)`;
            marker.style.setProperty('--edge', Math.min(1, point.depth * 4).toFixed(2));
            marker.classList.toggle('is-behind', !point.visible);
            if (marker === active && !point.visible) hide();
        });
        if (active) place();
    }

    function show(marker, animal) {
        if (!layer.classList.contains('is-on') || marker.classList.contains('is-behind') || marker === selected) return;
        active = marker;
        card.querySelector('img').src = animal.image;
        card.querySelector('strong').textContent = animal.name;
        card.querySelector('.earth-card__place').textContent = animal.place + ', ' + animal.country;
        const status = card.querySelector('.earth-card__status');
        const latin = card.querySelector('.earth-card__latin');
        const feature = card.querySelector('.earth-card__feature');
        [latin, feature].forEach(element => { element.textContent = ''; });
        statusBadge(status, 'earth-card__status', null);
        place();
        card.classList.add('is-visible');
        // Fill in the field-guide details (status, Latin name, signature feature) once they arrive.
        profiles.then(map => {
            const profile = map.get(normalise(animal.name));
            if (!profile || active !== marker) return;
            statusBadge(status, 'earth-card__status', profile.querySelector('.status'));
            const scientific = profile.querySelector('.scientific-name');
            if (scientific) latin.textContent = scientific.textContent;
            const signature = profile.querySelector('.animal-profile__feature');
            if (signature) feature.textContent = signature.textContent.replace(/^\s*Signature:\s*/, '');
            place();
        });
    }

    // Conservation status as the same two-part IUCN badge ("CR | Critically endangered") that the
    // animal list and the detail page use. `source` is the field-guide .status element, or null to clear.
    const STATUS_ABBR = { critical: 'CR', endangered: 'EN', vulnerable: 'VU' };
    function statusBadge(element, base, source) {
        element.className = base;
        element.replaceChildren();
        if (!source) return;
        const key = [...source.classList].filter(name => name.startsWith('status--'))
            .map(name => name.slice('status--'.length)).find(name => STATUS_ABBR[name]);
        const label = document.createElement('span');
        label.textContent = source.textContent.trim();
        if (key) {
            element.classList.add('iucn', 'iucn--' + key);
            const abbr = document.createElement('b');
            abbr.textContent = (window.animalData && animalData.IUCN[key] || {}).abbr || STATUS_ABBR[key];
            element.append(abbr);
        } else element.classList.add('iucn');
        element.append(label);
    }

    function hide() {
        active = null;
        card.classList.remove('is-visible');
    }

    // Keep the card beside its marker, flipping sides near the viewport edges.
    function place() {
        const box = active.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        const width = card.offsetWidth, height = card.offsetHeight, gap = 18;
        const left = x + gap + width > innerWidth - 12 ? x - gap - width : x + gap;
        const top = Math.max(12, Math.min(innerHeight - height - 12, y - height / 2));
        card.style.left = left + 'px';
        card.style.top = top + 'px';
    }

    // Clicking a marker zooms in on it; `before` remembers the view from before the first click
    // (switching straight to another animal keeps it), so closing the profile can return there.
    const ZOOM_IN = 2.4;
    let before = null;
    function select(marker, animal) {
        if (!selected) { const view = earthView.getState(); before = { lon: view.lon, lat: view.lat, zoom: view.zoom }; }
        if (selected) selected.classList.remove('is-selected');
        selected = marker;
        marker.classList.add('is-selected');
        layer.classList.add('has-selection');
        hide();
        panel.querySelector('.animal-panel__image').src = animal.image;
        panel.querySelector('.animal-panel__image').alt = animal.name;
        panel.querySelector('h2').textContent = animal.name;
        panel.querySelector('.animal-panel__more').onclick = () => window.animalDetail && animalDetail.open(animal.name);
        panel.querySelector('.animal-panel__place').textContent = animal.place + ', ' + animal.country;
        const status = panel.querySelector('.animal-panel__status');
        const habitat = panel.querySelector('.animal-panel__habitat');
        const scientific = panel.querySelector('.animal-panel__scientific');
        const facts = panel.querySelector('.animal-panel__facts');
        [habitat, scientific].forEach(element => { element.textContent = ''; });
        statusBadge(status, 'animal-panel__status', null);
        facts.replaceChildren();
        profiles.then(map => {
            const profile = map.get(normalise(animal.name));
            if (!profile || selected !== marker) return;
            statusBadge(status, 'animal-panel__status', profile.querySelector('.status'));
            const number = profile.querySelector('.specimen-number');
            if (number) habitat.textContent = number.textContent.split('·').pop().trim();
            const latin = profile.querySelector('.scientific-name');
            if (latin) scientific.textContent = latin.textContent;
            profile.querySelectorAll('.animal-profile__body p').forEach(paragraph => {
                const copy = document.importNode(paragraph, true);
                copy.removeAttribute('class');   // field-guide classes force light-page colours
                facts.append(copy);
            });
        });
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        // The globe glides into the free space while it slowly turns this animal to face the
        // viewer and zooms in on it, so the marker drifts to the middle of the space beside the panel.
        earthView.setFocus(true);
        earthView.flyTo(animal.lat, animal.lng, { zoom: Math.max(earthView.getState().zoom, ZOOM_IN), duration: 2700 });
    }

    // how: 'restore' (close button, Esc, clicking empty space or the marker again) flies back to
    // the view from before the click; 'drag' leaves the rotation to the user and only eases the
    // zoom part of the way out; 'none' (going home, filtering) leaves the camera alone.
    function deselect(how = 'restore') {
        if (!selected) return;
        selected.classList.remove('is-selected');
        selected = null;
        layer.classList.remove('has-selection');
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        earthView.setFocus(false);
        const view = before; before = null;
        if (!view) return;
        if (how === 'restore')
            earthView.flyTo(view.lat * 180 / Math.PI, view.lon * 180 / Math.PI, { zoom: view.zoom, duration: 2200 });
        else if (how === 'drag') {
            const now = earthView.getState().zoom;
            if (now > view.zoom) earthView.zoomTo(Math.sqrt(now * view.zoom), 380);
        }
    }

    // Habitat filter: only markers whose animal lives in the chosen habitat stay on the globe.
    const HABITATS = ['forest', 'ocean', 'freshwater', 'island', 'grassland'];
    let habitat = 'all';
    function setHabitat(name) {
        habitat = name;
        let shown = 0;
        markers.forEach(({ marker, animal }) => {
            const out = name !== 'all' && !(animal.habitats || []).includes(name);
            marker.classList.toggle('is-filtered', out);
            if (!out) marker.style.setProperty('--delay', (shown++ * 45) + 'ms');
            if (out && marker === selected) deselect('none');
            if (out && marker === active) hide();
        });
        document.querySelectorAll('.habitat-menu button[data-habitat]').forEach(button =>
            button.setAttribute('aria-pressed', String(button.dataset.habitat === name)));
        const link = document.querySelector('#site-header a[href="#habitats"]');
        if (link) link.classList.toggle('is-active', name !== 'all');
    }
    function chooseHabitat(name) {
        load().then(() => {
            setHabitat(name);
            document.dispatchEvent(new CustomEvent('habitatchoose', { detail: { habitat: name } }));
        }).catch(error => console.error(error));
    }
    function buildHabitatMenu(link) {
        let menu = link.parentElement.querySelector('.habitat-menu');
        if (!menu) {
            menu = document.createElement('ul');
            menu.className = 'habitat-menu';
            menu.id = 'habitat-menu';
            menu.innerHTML = ['all', ...HABITATS].map(name =>
                `<li><button type="button" data-habitat="${name}" aria-pressed="${name === habitat}">${name === 'all' ? 'All habitats' : name[0].toUpperCase() + name.slice(1)}</button></li>`).join('');
            menu.addEventListener('click', event => {
                const button = event.target.closest('button[data-habitat]');
                if (button) chooseHabitat(button.dataset.habitat);
            });
            link.after(menu);
            link.setAttribute('aria-controls', 'habitat-menu');
            link.setAttribute('aria-expanded', 'false');
        }
        return menu;
    }
    function toggleHabitatMenu(link) {
        buildHabitatMenu(link);
        if (window.siteNav) siteNav.toggleSubmenu(link);
    }
    // Build the (folded) sub-list as soon as the menu exists, so hovering "Habitats" can unfold it.
    const habitatsLink = () => document.querySelector('#site-header a[href="#habitats"]');
    if (habitatsLink()) buildHabitatMenu(habitatsLink());
    document.addEventListener('navready', () => { if (habitatsLink()) buildHabitatMenu(habitatsLink()); });

    // Markers are always on: they fade in beside the heading on page load.
    load().then(() => requestAnimationFrame(() => layer.classList.add('is-on')))
        .catch(error => console.error(error));

    // The header is injected by nav.js, so listen at the document level.
    document.addEventListener('click', event => {
        const link = event.target.closest('#site-header a[href="#habitats"]');
        if (!link) return;
        event.preventDefault();
        toggleHabitatMenu(link);
    });
    panel.querySelector('.animal-panel__close').addEventListener('click', () => deselect());
    addEventListener('keydown', event => { if (event.key === 'Escape') deselect(); });
    // A plain click on empty space (not the end of a drag) closes the profile and flies back;
    // dragging the globe with one finger or the mouse closes it and eases the zoom out.
    let downAt = null;
    const touching = new Set();
    canvas.addEventListener('pointerdown', event => { downAt = [event.clientX, event.clientY]; touching.add(event.pointerId); });
    canvas.addEventListener('pointermove', event => {
        if (!selected || !downAt || touching.size !== 1 || !touching.has(event.pointerId)) return;
        if (Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) >= 5) deselect('drag');
    });
    ['pointerup', 'pointercancel'].forEach(type => canvas.addEventListener(type, event => touching.delete(event.pointerId)));
    canvas.addEventListener('click', event => {
        if (downAt && Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) < 5) deselect();
    });
    // Home returns to the opening view: close the profile and show every habitat again.
    canvas.addEventListener('earthhome', () => { hide(); deselect('none'); setHabitat('all'); });
    canvas.addEventListener('earthviewchange', update);
    addEventListener('resize', update);
})();
