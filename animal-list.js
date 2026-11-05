/* Home-page animal list. The menu's "Animals" link (which opens the field guide on other pages)
   zooms the Earth into a random corner of the planet and sinks it into the bottom-right quarter of
   the screen as a locked backdrop, while the starfield keeps moving. The field-guide profile cards
   then appear one after another; more fade in as the list is scrolled. */
(() => {
    'use strict';
    const canvas = document.getElementById('earth-canvas');
    if (!canvas || !window.earthView) return;

    const view = document.createElement('section');
    view.className = 'animal-list-view';
    view.id = 'animal-list-view';
    view.setAttribute('aria-labelledby', 'animal-list-title');
    view.hidden = true;
    view.innerHTML =
        '<div class="animal-list-view__head">' +
            '<div><h2 id="animal-list-title">Animals at the edge</h2>' +
            '<p class="animal-list-view__count">Loading the field guide…</p></div>' +
            '<button type="button" class="animal-list-view__close">Back to Earth</button>' +
        '</div>' +
        '<div class="animal-list-view__grid"></div>';
    document.querySelector('.earth-viewport').after(view);
    const grid = view.querySelector('.animal-list-view__grid');
    const count = view.querySelector('.animal-list-view__count');

    const images = typeof animalImages === 'object' ? animalImages : {};
    let built = null;
    function build() {
        if (!built) built = fetch('project.html')
            .then(response => { if (!response.ok) throw new Error('Field guide failed to load'); return response.text(); })
            .then(html => {
                const profiles = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.animal-profile');
                profiles.forEach(profile => grid.append(card(profile)));
                count.textContent = profiles.length + ' species from every continent, each with a feature no other animal shares.';
            })
            .catch(error => {
                built = null;   // allow a retry next time the list opens
                count.textContent = 'The field guide could not load. Open this site through Live Server and try again.';
                console.error(error);
            });
        return built;
    }

    function card(profile) {
        const article = document.createElement('article');
        article.className = 'list-card';
        const name = profile.querySelector('h3')?.textContent.trim() || '';
        const figure = document.createElement('figure');
        figure.className = 'list-card__image';
        const [src, alt] = images[name] || [];
        if (src) {
            const image = document.createElement('img');
            image.src = src;
            image.alt = alt || name;
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => { image.remove(); figure.classList.add('is-unavailable'); }, { once: true });
            figure.append(image);
        } else figure.classList.add('is-unavailable');
        const body = document.createElement('div');
        body.className = 'list-card__body';
        const meta = document.createElement('p');
        meta.className = 'list-card__meta';
        const status = profile.querySelector('.status');
        if (status) {
            const badge = document.createElement('span');
            badge.className = 'list-card__status';
            badge.textContent = status.textContent;
            status.classList.forEach(c => { if (c.startsWith('status--')) badge.classList.add(c); });
            meta.append(badge);
        }
        const number = profile.querySelector('.specimen-number');
        if (number) {
            const where = document.createElement('span');
            where.textContent = number.textContent;
            meta.append(where);
        }
        const title = document.createElement('h3');
        title.textContent = name;
        const latin = document.createElement('p');
        latin.className = 'list-card__latin';
        latin.textContent = profile.querySelector('.scientific-name')?.textContent || '';
        body.append(meta, title, latin);
        profile.querySelectorAll('.animal-profile__body p').forEach(paragraph => {
            const copy = document.importNode(paragraph, true);
            copy.removeAttribute('class');
            body.append(copy);
        });
        article.append(figure, body);
        return article;
    }

    // Cards fade in one by one as they come into view, so the list unrolls slowly.
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

    const link = () => document.querySelector('#site-header a[href="#animals"]');
    let open = false, hideTimer = 0, startTimer = 0;
    function show() {
        if (open) return;
        // Return to a clean stage first: closes any profile panel or habitat flight.
        earthView.flyHome();
        open = true;
        document.body.classList.add('is-listing');
        link()?.classList.add('is-active');
        clearTimeout(hideTimer);
        view.hidden = false;
        view.scrollTop = 0;
        earthView.setBackdrop(true);
        // Any corner of the planet: a random point between the polar circles, seen close up.
        const lat = Math.random() * 110 - 50, lng = Math.random() * 360 - 180;
        earthView.flyTo(lat, lng, { zoom: 1.9, duration: 3200 });
        requestAnimationFrame(() => view.classList.add('is-open'));
        // The globe moves first; the cards follow once it has started to settle.
        clearTimeout(startTimer);
        startTimer = setTimeout(() => build().then(() => { if (open) watch(); }), 900);
        view.querySelector('.animal-list-view__close').focus({ preventScroll: true });
    }
    function close(flyBack = true) {
        if (!open) return;
        open = false;
        clearTimeout(startTimer);
        document.body.classList.remove('is-listing');
        link()?.classList.remove('is-active');
        view.classList.remove('is-open');
        earthView.setBackdrop(false);
        hideTimer = setTimeout(() => { view.hidden = true; unwatch(); }, 600);
        if (flyBack) earthView.flyHome();
    }

    // The header is injected by nav.js, so listen at the document level.
    document.addEventListener('click', event => {
        const item = event.target.closest('#site-header a[href="#animals"], #site-header a[href="#habitats"]');
        if (!item) return;
        if (item.getAttribute('href') === '#habitats') { close(); return; }   // habitat menu takes over
        event.preventDefault();
        // Fold the menu at once so it never sits on top of the list heading and cards.
        const header = document.getElementById('site-header');
        if (header && header.classList.contains('has-toggle') && !header.classList.contains('is-collapsed'))
            header.querySelector('.nav-toggle')?.click();
        open ? close() : show();
    });
    view.querySelector('.animal-list-view__close').addEventListener('click', () => close());
    addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    // The logo's flyHome (or any other return home) also ends the list.
    canvas.addEventListener('earthhome', () => close(false));
})();
