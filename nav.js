function addNavToggle() {
    const header = document.getElementById('site-header');
    const nav = header && header.querySelector('nav');
    if (!nav || nav.querySelector('.nav-toggle')) return;
    const panel = document.createElement('div');
    panel.className = 'nav-panel';
    panel.id = 'nav-panel';
    panel.append(...nav.children);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-toggle';
    button.setAttribute('aria-controls', 'nav-panel');
    nav.append(button, panel);
    header.classList.add('has-toggle');
    // ---- Sub-lists (Habitats, Settings) ----------------------------------------------------------
    // Each sub-list stays folded until its item is hovered (or reached with the keyboard). On touch
    // screens a tap on the item opens or folds it instead, one at a time.
    let lastPointer = 'mouse';
    document.addEventListener('pointerdown', event => { lastPointer = event.pointerType; }, true);
    const submenuOf = li => li && li.querySelector(':scope > .habitat-menu');
    function setSubmenu(li, open, keepOthers = false) {
        const menu = submenuOf(li);
        if (!menu) return;
        if (open && !keepOthers) panel.querySelectorAll('.links > li').forEach(other => { if (other !== li) setSubmenu(other, false); });
        if (open && !menu.classList.contains('is-open')) void menu.offsetHeight;   // start the unfold from the folded state
        menu.classList.toggle('is-open', open);
        li.querySelector(':scope > a')?.setAttribute('aria-expanded', String(open));
    }
    const closeSubmenus = () => panel.querySelectorAll('.links > li').forEach(li => setSubmenu(li, false));
    // With a mouse nothing folds while the pointer is still inside the menu, so no item ever slides out
    // from under it: a sub-list opens once the pointer rests on its item (merely passing over one does
    // not open it), and every open sub-list folds only after the pointer has been outside the whole
    // menu for a moment.
    const OPEN_DELAY = 300, CLOSE_DELAY = 800;
    let outsideTimer = 0;
    panel.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') clearTimeout(outsideTimer); });
    panel.addEventListener('pointerleave', event => {
        if (event.pointerType === 'touch') return;
        clearTimeout(outsideTimer);
        outsideTimer = setTimeout(() => {
            if (panel.matches(':hover')) return;
            panel.querySelectorAll('.links > li').forEach(li => { if (!li.querySelector(':focus-visible')) setSubmenu(li, false); });
        }, CLOSE_DELAY);
    });
    panel.querySelectorAll('.links > li').forEach(li => {
        let enterTimer = 0;
        const keyboardFocus = () => !!li.querySelector(':focus-visible');
        li.addEventListener('pointerenter', event => {
            if (event.pointerType === 'touch' || !submenuOf(li)) return;
            clearTimeout(enterTimer);
            enterTimer = setTimeout(() => { if (li.matches(':hover')) setSubmenu(li, true, true); }, OPEN_DELAY);
        });
        li.addEventListener('pointerleave', () => clearTimeout(enterTimer));
        li.addEventListener('focusin', () => { if (keyboardFocus()) setSubmenu(li, true); });
        // Keyboard users: leaving the item with Tab folds it. A pointer still inside the menu leaves
        // folding to the timer above.
        li.addEventListener('focusout', event => { if (!li.contains(event.relatedTarget) && !panel.matches(':hover')) setSubmenu(li, false); });
    });
    // Called by the scripts that own a sub-list (earth-markers.js, i18n.js) when its item is clicked.
    // With a mouse the sub-list is already open from hovering, so the click keeps it open.
    function toggleSubmenu(link) {
        const li = link.closest('li');
        const open = link.getAttribute('aria-expanded') !== 'true';
        if (!open && lastPointer === 'mouse' && li.matches(':hover')) return;
        setSubmenu(li, open, lastPointer === 'mouse');
    }

    // Folding starts from the menu's real height (not the 760px ceiling in the CSS), so it visibly
    // shrinks upwards from the first frame instead of only fading out.
    function pinHeight() {
        panel.style.transition = 'none';
        panel.style.maxHeight = panel.offsetHeight + 'px';
        void panel.offsetHeight;
        panel.style.transition = '';
        panel.style.maxHeight = '';
    }
    let shown = false;   // the very first render sets the saved state without animating
    const render = collapsed => {
        if (shown && collapsed && !header.classList.contains('is-collapsed')) pinHeight();
        shown = true;
        header.classList.toggle('is-collapsed', collapsed);
        button.textContent = collapsed ? '☰' : '✕';
        button.setAttribute('aria-expanded', String(!collapsed));
        button.setAttribute('aria-label', collapsed ? 'Show menu' : 'Hide menu');
        try { localStorage.setItem('navCollapsed', collapsed ? '1' : '0'); } catch (e) {}
        if (collapsed) closeSubmenus();
        armIdle();
    };

    // ---- Folding the whole menu away on its own ---------------------------------------------------
    // The menu folds after 5 seconds without any activity in it (it waits while the pointer rests on
    // it or a keyboard user is inside it), and at once when the visitor does anything elsewhere.
    const IDLE = 5000;
    let idleTimer = 0;
    function armIdle() {
        clearTimeout(idleTimer);
        if (header.classList.contains('is-collapsed')) return;
        idleTimer = setTimeout(() => {
            if (panel.matches(':hover') || panel.querySelector(':focus-visible')) armIdle();
            else render(true);
        }, IDLE);
    }
    const NAV_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta']);
    ['pointerdown', 'wheel', 'keydown'].forEach(type => document.addEventListener(type, event => {
        if (header.classList.contains('is-collapsed')) return;
        if (header.contains(event.target)) { armIdle(); return; }
        if (type === 'keydown' && NAV_KEYS.has(event.key)) return;   // moving focus is not "doing something else"
        render(true);
    }, { capture: true, passive: true }));
    ['pointermove', 'focusin'].forEach(type => header.addEventListener(type, armIdle));

    let saved = false;
    try { saved = localStorage.getItem('navCollapsed') === '1'; } catch (e) {}
    render(saved);
    // After choosing a menu item, fold the menu away on its own (once the pointer has left it).
    let timer = 0;
    const closeLater = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (panel.matches(':hover')) closeLater();
            else render(true);
        }, 1500);
    };
    panel.addEventListener('click', event => {
        const item = event.target.closest('a, button');
        if (!item) return;
        // An item that only unfolds its sub-list is not a choice yet: leave the menu open.
        if (item.matches('.links > li > a[aria-controls]')) return;
        // On the home page the "Vanishing Wild" logo folds the menu and eases the Earth back to
        // its opening view, where the heading and the animal markers are shown together.
        if (window.earthView && item.classList.contains('logo')) {
            event.preventDefault();
            clearTimeout(timer);
            render(true);
            window.earthView.flyHome();
            return;
        }
        closeLater();
    });
    button.addEventListener('click', () => {
        clearTimeout(timer);
        const opening = header.classList.contains('is-collapsed');
        render(!opening);
        // On the home page, opening the menu works like starting to explore: the globe glides to
        // the middle of the screen and the heading fades away.
        if (opening && window.earthView) window.earthView.explore();
    });

    window.siteNav = { toggleSubmenu, collapse: () => render(true) };
    // Lets the scripts that own a sub-list build it now, so hovering can unfold it straight away.
    document.dispatchEvent(new CustomEvent('navready'));
}

function load(file, target, fallbackHtml) {
    const container = document.getElementById(target);
    if (!container) return;

    fetch(file, { cache: "no-store" })
        .then(response => {
            if (!response.ok) {
                throw new Error("Failed to load " + file);
            }
            return response.text();
        })
        .then(html => {
            container.innerHTML = html;
        })
        .catch(() => {
            container.innerHTML = fallbackHtml;
        })
        .finally(() => {
            if (target === 'site-header') addNavToggle();
        });
}

load('nav.html', 'site-header', `
    <nav aria-label="Main navigation">
        <a class="logo" href="index.html" aria-label="Vanishing Wild: home and animals">
            <span>Vanishing Wild</span>
        </a>
        <ul class="links">
            <li><a href="#animals">Animals</a></li>
            <li><a href="#habitats">Habitats</a></li>
            <li><a href="#settings">Settings</a></li>
            <li><a href="#about">About</a></li>
        </ul>
    </nav>
`);

load('footer.html', 'site-footer', `
    <p>Vanishing Wild · Web Technologies 2026</p>
    <address>
        <a href="mailto:yangxiangjun821@gmail.com">yangxiangjun821@gmail.com</a>
    </address>
`);
