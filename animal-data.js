/* One shared, lazily loaded record for every animal, used by the species cards (animal-list.js) and
   the detail page (animal-detail.js). Built from data the site already has:
     project.html                          name, scientific name, IUCN category, range, signature, threats
     images/animal-photo-credits.json      photographer, licence and source page of each photograph
     images/animals/animal-locations.json  one representative place (for the small map)
     images/animals/animal-details.json    hand-checked facts (see its _readme). Anything missing there
                                           is shown to readers as "No reliable data yet", never guessed.
     images/animals/animal-details-en.json the same facts in English, shown when the site is in English */
window.animalData = (() => {
    'use strict';
    const IUCN = {
        critical: { abbr: 'CR', en: 'Critically endangered' },
        endangered: { abbr: 'EN', en: 'Endangered' },
        vulnerable: { abbr: 'VU', en: 'Vulnerable' }
    };
    const ORDER = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX'];
    const text = element => element ? element.textContent.replace(/\s+/g, ' ').trim() : '';
    const json = url => fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
    let loading = null;

    function load() {
        if (loading) return loading;
        loading = Promise.all([
            fetch('project.html').then(r => { if (!r.ok) throw new Error('Field guide failed to load'); return r.text(); }),
            json('images/animal-photo-credits.json'), json('images/animals/animal-locations.json'), json('images/animals/animal-details.json'),
            json('images/animals/animal-details-en.json')
        ]).then(([html, credits, locations, details, detailsEn]) => {
            const creditOf = new Map((credits || []).map(c => [c.title, c]));
            const placeOf = new Map((locations || []).map(l => [l.name, l]));
            const records = new Map();
            new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.animal-profile').forEach(article => {
                const name = text(article.querySelector('h3'));
                const statusEl = article.querySelector('.status');
                const key = [...(statusEl ? statusEl.classList : [])].map(c => c.replace('status--', '')).find(c => IUCN[c]) || '';
                const paragraphs = [...article.querySelectorAll('.animal-profile__body p')].map(p => {
                    const copy = p.cloneNode(true);
                    copy.querySelector('strong')?.remove();
                    return text(copy);
                });
                const label = text(article.querySelector('.specimen-number'));
                const credit = creditOf.get(name) || (name === 'Antarctic blue whale' ? creditOf.get('Blue whale') : null);
                records.set(name, {
                    name, key,
                    latin: text(article.querySelector('.scientific-name')),
                    number: label.split('·')[0].trim(),
                    habitatLabel: label.split('·').slice(1).join('·').trim(),
                    habitats: (article.dataset.habitat || '').split(' ').filter(Boolean),
                    feature: paragraphs[0] || '', range: paragraphs[1] || '', risk: paragraphs[2] || '',
                    credit, place: placeOf.get(name) || null,
                    details: (details && details[name]) || null,
                    detailsEn: (detailsEn && detailsEn[name]) || null
                });
            });
            return records;
        }).catch(error => { loading = null; throw error; });
        return loading;
    }

    // "Photo: artist · licence" caption linking to the Wikimedia Commons page the photograph came from.
    window.animalCredit = record => {
        const caption = document.createElement('figcaption');
        caption.className = 'photo-credit';
        const c = record.credit;
        if (!c) { caption.textContent = 'Photo credit: see CREDITS.md'; return caption; }
        const artist = (c.artist || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const short = artist.length > 42 ? artist.slice(0, 41) + '…' : artist;
        caption.append('Photo: ');
        const link = document.createElement('a');
        link.href = c.source; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = (short || 'Wikimedia Commons') + ' · ' + c.license;
        link.title = artist + ' · ' + c.license;
        link.dataset.i18nOff = '';
        caption.append(link);
        return caption;
    };
    return { load, IUCN, ORDER };
})();
