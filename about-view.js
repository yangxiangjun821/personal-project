/* Home-page About view. Works like the animal list (animal-list.js), but the Earth turns to a
   fixed, tilted view over the North Atlantic and sinks into the bottom-left quarter instead, so
   the cards unroll on the right-hand side of the screen. */
(() => {
    'use strict';
    const canvas = document.getElementById('earth-canvas');
    if (!canvas || !window.earthView) return;

    // [image, alt text, heading, kicker, paragraphs]
    const CARDS = [
        ['images/habitats/forest/danum-canopy.jpg', 'Rainforest canopy in Danum Valley, Borneo', 'The purpose', 'Why this site exists', [
            'Vanishing Wild is a student-made introduction to endangered animals, the places they need, and the choices that influence their future.',
            'It turns a large subject into approachable profiles. Each entry asks where an animal lives, what threatens it, and what useful protection looks like.']],
        ['images/habitats/grassland/serengeti-plains.jpg', 'Balloons drifting over the Serengeti plains', 'How to explore', 'One planet, one idea at a time', [
            'Drag the Earth to turn it and scroll to zoom. Every marker is an animal: choose one to read its profile.',
            'The <strong>Habitats</strong> menu flies down into a forest, ocean, island, freshwater or grassland, and shows how human pressure changes it.']],
        ['images/habitats/freshwater/okavango-floodplain.jpg', 'Aerial view of the Okavango Delta floodplain', 'How it is built', 'Plain web technologies', [
            'Semantic HTML, responsive CSS and small plain-JavaScript modules, with no framework or build step.',
            'The globe is drawn with WebGL on a single canvas, and every view stays usable with a keyboard and on a phone.']],
        ['images/habitats/island/fernandina-shore.jpg', 'Sea lions on the Fernandina shore at sunset', 'Editorial note', 'Facts that can change', [
            'Conservation status can change as assessments are updated. This edition avoids population estimates and keeps its claims introductory.',
            'The polluted habitat scenes are <strong>illustrations</strong> of hypothetical damage, not records of events at the named places.']],
        ['images/habitats/ocean/ningaloo-lagoon.jpg', 'Ningaloo Reef lagoon in Western Australia', 'Sources and credits', 'Who made the pictures', [
            'Animal and habitat photographs come from Wikimedia Commons under their stated licences; satellite imagery is Sentinel-2 cloudless by EOX.',
            'Every source, artist and licence is listed in CREDITS.md and the provenance notes beside the images.']],
        [null, '', 'Contact', 'Say hello', [
            'Have a species suggestion or feedback on the guide? Send an email to <a href="mailto:yangxiangjun821@gmail.com">yangxiangjun821@gmail.com</a>.']],
    ];

    const view = document.createElement('section');
    view.className = 'animal-list-view animal-list-view--about';
    view.id = 'about-view';
    view.setAttribute('aria-labelledby', 'about-view-title');
    view.hidden = true;
    view.innerHTML =
        '<div class="animal-list-view__head">' +
            '<div><h2 id="about-view-title">A field guide for paying attention</h2>' +
            '<p class="animal-list-view__count">About Vanishing Wild · Web Technologies 2026</p></div>' +
            '<button type="button" class="animal-list-view__close">Back to Earth</button>' +
        '</div>' +
        '<div class="animal-list-view__grid"></div>';
    document.querySelector('.earth-viewport').after(view);
    const grid = view.querySelector('.animal-list-view__grid');

    const t = text => window.i18n ? i18n.t(text) : text;
    // Built with i18n.t() so the cards can be rebuilt in the other language when it is switched.
    function buildCards() {
        grid.replaceChildren();
        CARDS.forEach(([src, alt, heading, kicker, paragraphs]) => {
            const article = document.createElement('article');
            article.className = 'list-card';
            if (src) {
                const figure = document.createElement('figure');
                figure.className = 'list-card__image';
                const image = document.createElement('img');
                image.src = src;
                image.alt = t(alt);
                image.loading = 'lazy';
                image.decoding = 'async';
                image.addEventListener('error', () => { image.remove(); figure.classList.add('is-unavailable'); }, { once: true });
                figure.append(image);
                article.append(figure);
            }
            const body = document.createElement('div');
            body.className = 'list-card__body';
            body.innerHTML = `<p class="list-card__meta"><span>${t(kicker)}</span></p><h3>${t(heading)}</h3>` +
                paragraphs.map(text => `<p>${t(text)}</p>`).join('');
            article.append(body);
            grid.append(article);
        });
    }
    buildCards();
    document.addEventListener('langchange', () => {
        buildCards();
        if (open) { unwatch(); grid.querySelectorAll('.list-card').forEach(c => c.classList.add('is-shown')); }
    });

    // Cards fade in one by one as they come into view, as in the animal list.
    let reveal = null, queue = [], ticking = 0;
    function drain() {
        const next = queue.shift();
        if (next) next.classList.add('is-shown');
        ticking = queue.length ? setTimeout(drain, 110) : 0;
    }
    function watch() {
        unwatch();
        reveal = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                reveal.unobserve(entry.target);
                queue.push(entry.target);
            });
            if (queue.length && !ticking) ticking = setTimeout(drain, 0);
        }, { root: view, rootMargin: '0px 0px -40px 0px' });
        grid.querySelectorAll('.list-card').forEach(c => reveal.observe(c));
    }
    function unwatch() {
        if (reveal) reveal.disconnect();
        reveal = null; queue = [];
        clearTimeout(ticking); ticking = 0;
        grid.querySelectorAll('.list-card').forEach(c => c.classList.remove('is-shown'));
    }

    const link = () => document.querySelector('#site-header a[href="#about"]');
    let open = false, hideTimer = 0, startTimer = 0;
    function show() {
        if (open) return;
        // Return to a clean stage first: this also closes the animal list, a profile or a habitat flight.
        earthView.flyHome();
        open = true;
        document.body.classList.add('is-listing', 'is-about');
        link()?.classList.add('is-active');
        clearTimeout(hideTimer);
        view.hidden = false;
        view.scrollTop = 0;
        earthView.setBackdrop(true, 'cornerLeft');
        // A different angle from the animal list: always the same view, tipped steeply towards the
        // Arctic over the North Atlantic, and pulled back so the curve of the planet shows.
        earthView.flyTo(52, -28, { zoom: 1.35, duration: 3200 });
        requestAnimationFrame(() => view.classList.add('is-open'));
        clearTimeout(startTimer);
        startTimer = setTimeout(() => { if (open) watch(); }, 900);
        view.querySelector('.animal-list-view__close').focus({ preventScroll: true });
    }
    function close(flyBack = true) {
        if (!open) return;
        open = false;
        clearTimeout(startTimer);
        document.body.classList.remove('is-listing', 'is-about');
        link()?.classList.remove('is-active');
        view.classList.remove('is-open');
        earthView.setBackdrop(false);
        hideTimer = setTimeout(() => { view.hidden = true; unwatch(); }, 600);
        if (flyBack) earthView.flyHome();
    }

    // The header is injected by nav.js, so listen at the document level. Choosing Animals runs its
    // own flyHome, which fires earthhome below and closes this view without a second flight.
    document.addEventListener('click', event => {
        const item = event.target.closest('#site-header a[href="#about"], #site-header a[href="#habitats"]');
        if (!item) return;
        if (item.getAttribute('href') === '#habitats') { close(); return; }
        event.preventDefault();
        const header = document.getElementById('site-header');
        if (header && header.classList.contains('has-toggle') && !header.classList.contains('is-collapsed'))
            header.querySelector('.nav-toggle')?.click();
        open ? close() : show();
    });
    view.querySelector('.animal-list-view__close').addEventListener('click', () => close());
    addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    canvas.addEventListener('earthhome', () => close(false));
})();
