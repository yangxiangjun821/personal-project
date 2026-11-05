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
    const render = collapsed => {
        header.classList.toggle('is-collapsed', collapsed);
        button.textContent = collapsed ? '☰' : '✕';
        button.setAttribute('aria-expanded', String(!collapsed));
        button.setAttribute('aria-label', collapsed ? 'Show menu' : 'Hide menu');
        try { localStorage.setItem('navCollapsed', collapsed ? '1' : '0'); } catch (e) {}
    };
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
