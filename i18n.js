/* English / Simplified Chinese switch. The pages are written in English; when Chinese is chosen this
   module swaps every text node and a few attributes for the matching string in i18n-zh.js, and keeps
   doing so for anything the other scripts add later (menus, animal cards, habitat dives). Switching
   back restores the original English. The choice is remembered in localStorage and is changed from
   the "Settings" item in the menu. Modules that build their own markup can call i18n.t(text) and
   listen for the "langchange" event on document. */
(() => {
    'use strict';
    const ZH = window.I18N_ZH || {};
    const STORE = 'lang';
    const ATTRS = ['aria-label', 'alt', 'title', 'placeholder', 'aria-valuetext'];
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE']);

    // Whole-string patterns for texts that contain numbers or other changing parts.
    const HABITAT_ZH = { all: '所有栖息地', forest: '森林', ocean: '海洋', freshwater: '淡水', island: '岛屿', grassland: '草原' };
    const PATTERNS = [
        [/^Showing all (\d+) animals\.$/, (m, n) => `显示全部 ${n} 种动物。`],
        [/^Showing (\d+) (?:animals?) from (all habitats|the (\w+) collection)\.$/, (m, n, which, name) =>
            `显示 ${n} 种动物，来自${name ? (HABITAT_ZH[name] || name) + '栖息地' : '所有栖息地'}。`],
        [/^(\d+) species from every continent, each with a feature no other animal shares\.$/, (m, n) => `来自各大洲的 ${n} 个物种，每一种都有其他动物所没有的独特特征。`],
        [/^Satellite imagery (\d+)%$/, (m, n) => `卫星影像 ${n}%`],
        [/^(.+) image unavailable$/, (m, name) => `${tr(name) || name} 的图片不可用`],
        [/^Sunlight zone · (\d+) m$/, (m, n) => `阳光带 · ${n} 米`],
        [/^Surface · 0 m$/, () => '水面 · 0 米']
    ];
    const PREFIXES = [['Learn more: ', '了解更多：'], ['Illustrative human impact: ', '示意性的人类影响：'], ['Photo: ', '照片：'], ['Base photo: ', '底图：']];

    function one(text) {
        if (ZH[text]) return ZH[text];
        for (const [pattern, make] of PATTERNS) {
            const match = text.match(pattern);
            if (match) return make(...match);
        }
        for (const [from, to] of PREFIXES) {
            if (text.startsWith(from)) {
                const rest = text.slice(from.length);
                return to + (tr(rest) || rest);
            }
        }
        if (text.endsWith('.') && ZH[text.slice(0, -1)]) return ZH[text.slice(0, -1)] + '。';
        return null;
    }
    // A string such as "Sunlight zone · 12 m" or "Okavango Delta, Botswana": translate the parts it
    // is made of, trying the longest run of parts first so place names that contain commas still match.
    function segments(text) {
        const bits = text.split(/( · |, )/);
        if (bits.length < 3) return null;
        const parts = [], seps = [];
        bits.forEach((bit, i) => (i % 2 ? seps : parts).push(bit));
        let out = '', hit = false;
        for (let i = 0; i < parts.length;) {
            let done = false;
            for (let j = parts.length; j > i && !done; j--) {
                let candidate = parts[i];
                for (let k = i + 1; k < j; k++) candidate += seps[k - 1] + parts[k];
                const found = ZH[candidate] || (j === i + 1 ? one(candidate) : null);
                if (found) {
                    out += found; hit = true; i = j; done = true;
                    if (i < parts.length) out += seps[i - 1] === ', ' ? '，' : seps[i - 1];
                }
            }
            if (!done) {
                out += parts[i]; i++;
                if (i < parts.length) out += seps[i - 1] === ', ' ? ', ' : seps[i - 1];
            }
        }
        return hit ? out : null;
    }
    function tr(raw) {
        const text = raw.trim();
        if (!text) return null;
        if (ZH[text]) return ZH[text];
        for (const [pattern, make] of PATTERNS) {
            const match = text.match(pattern);
            if (match) return make(...match);
        }
        const sentences = text.split(/(?<=[.!?…])\s+/);
        if (sentences.length > 1) {
            let hit = false;
            const out = sentences.map(sentence => {
                const found = one(sentence) || segments(sentence);
                if (found) hit = true;
                return found || sentence;
            }).reduce((all, piece) => all + (/[!-~]$/.test(all) && /^[!-~]/.test(piece) ? ' ' : '') + piece, '');
            if (hit) return out;
        }
        return one(text) || segments(text);
    }

    let lang = 'en';
    try { lang = localStorage.getItem(STORE) || ''; } catch (e) { lang = ''; }
    if (lang !== 'zh' && lang !== 'en') lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';

    const textRecord = new WeakMap();   // text node -> { en, zh }
    const attrRecord = new WeakMap();   // element -> { attribute: { en, zh } }

    function wrap(raw, translated) {
        return raw.match(/^\s*/)[0] + translated + raw.match(/\s*$/)[0];
    }
    const off = node => !!(node && node.closest && node.closest('[data-i18n-off]'));
    function fixText(node) {
        if (off(node.parentElement)) return;
        const current = node.nodeValue, record = textRecord.get(node);
        if (record && current === record.zh) {
            if (lang === 'en') { node.nodeValue = record.en; textRecord.delete(node); }
            return;
        }
        if (lang !== 'zh') return;
        const out = tr(current);
        if (!out) return;
        const zh = wrap(current, out);
        textRecord.set(node, { en: current, zh });
        node.nodeValue = zh;
    }
    function fixAttr(element, name) {
        if (!element.hasAttribute(name) || off(element)) return;
        if (name === 'content' && !(element.tagName === 'META' && element.getAttribute('name') === 'description')) return;
        const current = element.getAttribute(name);
        const records = attrRecord.get(element) || {};
        const record = records[name];
        if (record && current === record.zh) {
            if (lang === 'en') { element.setAttribute(name, record.en); delete records[name]; }
            return;
        }
        if (lang !== 'zh') return;
        const out = tr(current);
        if (!out) return;
        records[name] = { en: current, zh: wrap(current, out) };
        attrRecord.set(element, records);
        element.setAttribute(name, records[name].zh);
    }
    function sweep(root) {
        if (root.nodeType === 3) { if (!SKIP.has(root.parentNode?.nodeName)) fixText(root); return; }
        if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        const visit = node => {
            if (node.nodeType === 3) { if (!SKIP.has(node.parentNode?.nodeName)) fixText(node); return; }
            if (SKIP.has(node.nodeName)) return;
            ATTRS.forEach(name => fixAttr(node, name));
            if (node.tagName === 'META') fixAttr(node, 'content');
        };
        if (root.nodeType === 1) visit(root);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) visit(node);
    }

    let observer = null;
    function observe() {
        if (observer) return;
        observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'characterData') { if (!SKIP.has(record.target.parentNode?.nodeName)) fixText(record.target); }
                else if (record.type === 'attributes') fixAttr(record.target, record.attributeName);
                else record.addedNodes.forEach(node => sweep(node));
            }
        });
        observer.observe(document.documentElement, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: [...ATTRS, 'content']
        });
    }

    // Switching fades the text out, swaps the language while it is invisible, then fades it back in
    // (the Earth canvas stays put; see the .i18n-out / .i18n-in rules in style.css).
    const root = document.documentElement;
    let fadeTimer = 0;
    function apply(changed) {
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
        sweep(document);
        document.querySelectorAll('.settings-menu button[data-lang]').forEach(button =>
            button.setAttribute('aria-pressed', String(button.dataset.lang === lang)));
        if (changed) document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
    }
    function set(next) {
        if (next !== 'zh' && next !== 'en') return;
        const changed = next !== lang;
        lang = next;
        try { localStorage.setItem(STORE, lang); } catch (e) {}
        document.querySelectorAll('.settings-menu button[data-lang]').forEach(button =>
            button.setAttribute('aria-pressed', String(button.dataset.lang === lang)));
        if (!changed) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(true); return; }
        clearTimeout(fadeTimer);
        root.classList.remove('i18n-in');
        root.classList.add('i18n-out');
        fadeTimer = setTimeout(() => {
            apply(true);
            root.classList.remove('i18n-out');
            root.classList.add('i18n-in');
            fadeTimer = setTimeout(() => root.classList.remove('i18n-in'), 1400);
        }, 900);
    }

    // ---- Settings item in the menu ------------------------------------------------------------
    function buildMenu(link) {
        if (link.parentElement.querySelector('.settings-menu')) return;
        const menu = document.createElement('ul');
        menu.className = 'habitat-menu settings-menu';
        menu.id = 'settings-menu';
        menu.setAttribute('aria-label', 'Language');
        menu.innerHTML = [['en', 'English'], ['zh', '中文']].map(([code, label]) =>
            `<li><button type="button" data-lang="${code}" lang="${code}" aria-pressed="${code === lang}">${label}</button></li>`).join('');
        menu.addEventListener('click', event => {
            const button = event.target.closest('button[data-lang]');
            if (button) set(button.dataset.lang);
        });
        link.after(menu);
        link.setAttribute('aria-controls', 'settings-menu');
        link.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', event => {
        const link = event.target.closest('#site-header a[href="#settings"]');
        if (!link) return;
        event.preventDefault();
        buildMenu(link);
        if (window.siteNav) siteNav.toggleSubmenu(link);
    });
    // Build the (folded) language list as soon as the menu exists, so hovering "Settings" can unfold it.
    const settingsLink = () => document.querySelector('#site-header a[href="#settings"]');
    if (settingsLink()) buildMenu(settingsLink());
    document.addEventListener('navready', () => { if (settingsLink()) buildMenu(settingsLink()); });

    window.i18n = {
        lang: () => lang,
        set,
        t: text => (lang === 'zh' && text ? tr(text) || text : text)
    };

    // Start after the page's own scripts have read their English text (animals.js looks profiles up by name).
    const start = () => {
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
        sweep(document);
        observe();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
