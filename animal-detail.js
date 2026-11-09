/* Species detail page: a full-height reading panel that opens over the home page (the Earth and starfield
   stay behind it). Opened with animalDetail.open(name), e.g. from the "Learn more" button on a card.
   Facts come from animal-data.js. A field with no hand-checked value is shown as "No reliable data yet". */
(() => {
    'use strict';
    if (!window.animalData) return;
    const NO_DATA = 'No reliable data yet';
    const ZH = () => window.I18N_ZH || {};
    const zhName = name => ZH()[name] || name;
    // The name in the other language, shown beside the main one (which the language switch translates).
    const altName = name => (window.i18n && i18n.lang() === 'zh') ? name : zhName(name);
    const isZh = () => !!(window.i18n && i18n.lang() === 'zh');

    // The hand-checked facts are written in Chinese (animal-details.json), with an English copy of the
    // same shape (animal-details-en.json). In English each Chinese text is swapped for its English
    // counterpart; one without a counterpart is left out (shown as "No reliable data yet") rather than
    // mixing languages. Numbers, links and dates are kept from the Chinese file.
    const CJK = /[一-鿿]/;
    function inEnglish(value, english) {
        if (typeof value === 'string') return typeof english === 'string' ? english : CJK.test(value) ? undefined : value;
        if (Array.isArray(value)) return value.map((item, i) => inEnglish(item, Array.isArray(english) ? english[i] : undefined))
            .filter(item => item !== undefined && !(typeof item === 'object' && item.label === undefined && 'url' in item));
        if (value && typeof value === 'object') {
            const result = {};
            for (const [key, item] of Object.entries(value)) {
                const converted = inEnglish(item, english && english[key]);
                if (converted !== undefined) result[key] = converted;
            }
            return result;
        }
        return value;
    }
    const factsFor = record => isZh() ? (record.details || {}) : inEnglish(record.details || {}, record.detailsEn || {});

    const ACTIONS = {
        all: [
            'Never buy ivory, horn, turtle shell, skins or other products made from wild animals, and report illegal wildlife trade.',
            'Learn from and support trustworthy conservation organisations and protected areas; check the source before sharing a story.',
            'Record what you see on a citizen-science platform such as iNaturalist, so researchers can use the data.',
            'On trips, watch wildlife from a distance: do not feed, touch or crowd animals, and take your rubbish home.'
        ],
        forest: ['Choose paper and wood products with FSC certification, and use less paper overall.', 'Never burn rubbish or clear land with fire.'],
        ocean: ['Cut back on single-use plastic, and pick seafood with a credible sustainability label such as MSC.', 'Join a beach clean-up and never leave fishing line or nets behind.'],
        freshwater: ['Save water, and never pour chemicals, paint or medicine down a drain or into a stream.', 'Dispose of litter properly so it does not wash into rivers and lakes.'],
        island: ['Check your bags and shoes for seeds, soil and insects before visiting an island, so no new species arrive with you.', 'Stay on marked paths and keep all litter with you.'],
        grassland: ['Keep to paths when walking or camping, and leave no litter.', 'Use fewer pesticides, and leave some flowers for pollinators.']
    };
    const HABITAT_NAME = { forest: 'Forest', ocean: 'Ocean', freshwater: 'Freshwater', island: 'Island', grassland: 'Grassland' };

    const view = document.createElement('section');
    view.className = 'animal-detail';
    view.id = 'animal-detail';
    view.hidden = true;
    view.setAttribute('role', 'dialog');
    view.setAttribute('aria-modal', 'false');
    view.setAttribute('aria-labelledby', 'animal-detail-title');
    view.innerHTML = '<div class="animal-detail__inner"></div>';
    document.body.append(view);
    const inner = view.querySelector('.animal-detail__inner');

    const el = (tag, className, content) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content != null) node.textContent = content;
        return node;
    };
    // A value, or the plain "no reliable data" note.
    const value = text => text ? el('span', 'ad-value', text) : el('span', 'ad-nodata', NO_DATA);
    function rows(pairs) {
        const dl = el('dl', 'ad-facts');
        pairs.forEach(([label, content]) => {
            const row = el('div', 'ad-facts__row');
            row.append(el('dt', null, label));
            const dd = el('dd');
            dd.append(content instanceof Node ? content : value(content));
            row.append(dd);
            dl.append(row);
        });
        return dl;
    }
    function section(id, title, ...children) {
        const block = el('section', 'ad-section');
        block.id = 'ad-' + id;
        block.setAttribute('aria-labelledby', 'ad-' + id + '-title');
        const heading = el('h3', null, title);
        heading.id = 'ad-' + id + '-title';
        block.append(heading, ...children);
        return block;
    }
    function list(items, className = 'ad-list') {
        const ul = el('ul', className);
        items.forEach(item => ul.append(el('li', null, item)));
        return ul;
    }
    const note = text => el('p', 'ad-note', text);

    function scale(key) {
        const abbr = key ? animalData.IUCN[key].abbr : '';
        const bar = el('ol', 'ad-scale');
        bar.setAttribute('aria-label', 'IUCN Red List categories');
        animalData.ORDER.forEach(code => {
            const item = el('li', code === abbr ? 'is-current' : '', code);
            if (code === abbr) item.setAttribute('aria-current', 'true');
            bar.append(item);
        });
        return bar;
    }

    function photo(record) {
        const figure = el('figure', 'ad-photo');
        const [src, alt] = (typeof animalImages === 'object' && animalImages[record.name]) || [];
        if (src) {
            const image = document.createElement('img');
            image.src = src; image.alt = alt || record.name; image.decoding = 'async';
            image.addEventListener('error', () => { image.remove(); figure.classList.add('is-unavailable'); }, { once: true });
            figure.append(image);
        } else figure.classList.add('is-unavailable');
        figure.append(window.animalCredit ? animalCredit(record) : el('figcaption'));
        return figure;
    }

    function map(record) {
        const place = record.place;
        if (!place) return note('No map location has been recorded for this species yet.');
        const box = el('figure', 'ad-map');
        const canvas = el('div', 'ad-map__canvas');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', place.place + ', ' + place.country);
        const dot = el('span', 'ad-map__dot');
        dot.style.left = ((place.lng + 180) / 360 * 100) + '%';
        dot.style.top = ((90 - place.lat) / 180 * 100) + '%';
        canvas.append(dot);
        const caption = el('figcaption');
        caption.append(el('strong', null, place.place + ', ' + place.country));
        caption.append(el('span', null, 'The dot marks one representative place, not the species’ full range.'));
        box.append(canvas, caption);
        return box;
    }

    function render(record) {
        const d = factsFor(record);
        const iucn = record.key ? animalData.IUCN[record.key] : null;
        // "Critically endangered (CR)" / "极危（CR）": built in the page language, as the row is rebuilt on a switch.
        const iucnText = iucn && (isZh() ? (window.i18n ? i18n.t(iucn.en) : iucn.en) + '（' + iucn.abbr + '）' : iucn.en + ' (' + iucn.abbr + ')');
        inner.replaceChildren();

        const top = el('div', 'ad-top');
        const back = el('button', 'ad-back', 'Back to list');
        back.type = 'button';
        back.addEventListener('click', () => close());
        top.append(back);

        const hero = el('div', 'ad-hero');
        const heading = el('div', 'ad-hero__text');
        heading.append(el('p', 'ad-kicker', record.number + ' · ' + record.habitatLabel));
        const title = el('h2', null, record.name);
        title.id = 'animal-detail-title';
        const alt = el('p', 'ad-alt');
        alt.dataset.i18nOff = '';
        alt.dataset.name = record.name;
        alt.textContent = altName(record.name);
        const latin = el('p', 'ad-latin', record.latin);
        latin.dataset.i18nOff = '';
        latin.lang = 'la';
        const badges = el('p', 'ad-badges');
        if (iucn) {
            const badge = el('span', 'iucn iucn--' + record.key);
            badge.append(el('b', null, iucn.abbr), el('span', null, iucn.en));
            badges.append(badge);
        }
        heading.append(title, alt, latin, badges, el('p', 'ad-intro', record.feature));
        hero.append(heading, photo(record));

        const body = el('div', 'ad-body');

        // Conservation status: the global IUCN category and China's national list are separate systems.
        body.append(section('status', 'Conservation status',
            scale(record.key),
            rows([
                ['Global (IUCN Red List)', iucn ? el('span', 'ad-value', iucnText) : value('')],
                ['Year assessed', d.iucnYear],
                ['China national list', d.china ? el('span', 'ad-value', d.china.level + (d.china.note ? ' · ' + d.china.note : '')) : value('')]
            ]),
            note('The IUCN category is a worldwide assessment. China’s national protection level is set by Chinese law. The two systems are separate and may differ.')));

        body.append(section('traits', 'Basic features', rows([
            ['Length', d.traits && d.traits.length], ['Weight', d.traits && d.traits.weight],
            ['Lifespan', d.traits && d.traits.lifespan], ['Appearance', record.feature]])));

        const tags = el('ul', 'ad-tags');
        record.habitats.forEach(h => tags.append(el('li', null, HABITAT_NAME[h] || h)));
        body.append(section('range', 'Range and habitat',
            rows([['Main range', record.range], ['Habitat', d.habitat || tags]]), map(record)));

        const b = d.behavior || {};
        body.append(section('behavior', 'Behaviour and life', rows([
            ['Food', b.food], ['Active', b.activity], ['Social life', b.social], ['Breeding', b.breeding]])));

        const p = d.population || {};
        body.append(section('population', 'Population today', rows([
            ['Wild estimate', p.estimate], ['Trend', p.trend], ['Area counted', p.scope], ['Year counted', p.year],
            ['Captive animals', p.captive]]),
            note('Wild and captive numbers, and worldwide and regional figures, are never mixed here. If a number is missing, no reliable source has been checked yet.')));

        const threats = el('div', 'ad-threats');
        threats.append(el('p', 'ad-lead', record.risk));
        if (d.threats && d.threats.length) threats.append(list(d.threats));
        body.append(section('threats', 'Main threats', threats));

        body.append(section('ecology', 'Why it matters', d.ecology ? el('p', null, d.ecology) : value('')));

        body.append(section('conservation', 'Conservation action',
            d.conservation && d.conservation.length ? list(d.conservation) : value('')));

        const things = [...record.habitats.flatMap(h => ACTIONS[h] || []), ...ACTIONS.all];
        body.append(section('act', 'What we can do', list(things),
            note('These are general habits that help wildlife and its habitat, not a fix tied to one project.')));

        const fun = d.didYouKnow;
        const funBox = el('div', 'ad-fun');
        if (fun && fun.text) { funBox.append(el('p', null, fun.text)); if (fun.source) funBox.append(el('small', null, fun.source)); }
        else funBox.append(value(''));
        body.append(section('fun', 'Did you know?', funBox));

        const sourceBox = el('div', 'ad-sources');
        const sources = d.sources || [];
        if (sources.length) {
            const ul = el('ul', 'ad-list');
            sources.forEach(s => {
                const li = el('li'), a = el('a', null, s.label);
                a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
                li.append(a); ul.append(li);
            });
            sourceBox.append(ul);
        } else sourceBox.append(note('No checked sources are recorded for this species yet. Look it up on the IUCN Red List before relying on its status.'));
        const search = el('a', null, 'Search the IUCN Red List');
        search.href = 'https://www.iucnredlist.org/search?query=' + encodeURIComponent(record.latin) + '&searchType=species';
        search.target = '_blank'; search.rel = 'noopener noreferrer';
        const searchLine = el('p', 'ad-note'); searchLine.append(search);
        sourceBox.append(searchLine);
        if (sources.length) sourceBox.append(note('Figures here were compiled from Wikipedia and the IUCN assessments it cites. Check the IUCN Red List for the latest numbers before quoting them.'));
        sourceBox.append(rows([['Last updated', d.updated || 'Guide text compiled 2026-11-08; facts not yet individually checked']]));
        body.append(section('sources', 'Sources', sourceBox));

        inner.append(top, hero, body);
    }

    let current = null, open = false;
    function openDetail(name) {
        return animalData.load().then(records => {
            const record = records.get(name);
            if (!record) return;
            current = record;
            render(record);
            open = true;
            view.hidden = false;
            view.scrollTop = 0;
            requestAnimationFrame(() => view.classList.add('is-open'));
            document.body.classList.add('is-detail');
            inner.querySelector('.ad-back').focus({ preventScroll: true });
        }).catch(error => console.error(error));
    }
    function close() {
        if (!open) return;
        open = false;
        view.classList.remove('is-open');
        document.body.classList.remove('is-detail');
        setTimeout(() => { if (!open) view.hidden = true; }, 450);
    }
    // Escape closes only the detail page, not the list or profile beneath it.
    addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !open) return;
        event.stopImmediatePropagation();
        close();
    }, true);
    // Anything that returns to the home view also ends the reading panel.
    document.getElementById('earth-canvas')?.addEventListener('earthhome', close);
    // Rebuild in the new language: names, and text built from data, follow the switch.
    document.addEventListener('langchange', () => {
        document.querySelectorAll('.ad-alt, .card-alt').forEach(node => { node.textContent = altName(node.dataset.name); });
        if (open && current) { const top = view.scrollTop; render(current); view.scrollTop = top; }
    });
    window.animalDetail = { open: openDetail, close, altName };
})();
