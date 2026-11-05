const filterButtons = document.querySelectorAll('.filter');
const animalProfiles = document.querySelectorAll('.animal-profile');
const filterStatus = document.getElementById('filter-status');
const habitatSection = document.getElementById('habitats');

animalProfiles.forEach(profile => {
    const name = profile.querySelector('h3')?.textContent.trim();
    const imageData = animalImages[name];
    if (!imageData) return;

    const figure = document.createElement('figure');
    figure.className = 'animal-profile__image';
    const image = document.createElement('img');
    image.src = imageData[0];
    image.alt = imageData[1];
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
        figure.classList.add('is-unavailable');
        image.hidden = true;
        const message = document.createElement('span');
        message.textContent = `${name} image unavailable`;
        figure.append(message);
    }, { once: true });
    figure.append(image);
    profile.prepend(figure);
});

filterButtons.forEach(button => {
    button.addEventListener('click', () => {
        const selectedHabitat = button.dataset.filter;
        let visibleCount = 0;

        filterButtons.forEach(item => {
            const isSelected = item === button;
            item.classList.toggle('is-active', isSelected);
            item.setAttribute('aria-pressed', String(isSelected));
        });

        animalProfiles.forEach(profile => {
            const habitats = profile.dataset.habitat.split(' ');
            const matches = selectedHabitat === 'all' || habitats.includes(selectedHabitat);
            profile.hidden = !matches;
            if (matches) visibleCount += 1;
        });

        const isOcean = selectedHabitat === 'ocean';
        habitatSection.classList.toggle('is-ocean', isOcean);
        habitatSection.dispatchEvent(new CustomEvent('habitatchange', {
            detail: { habitat: selectedHabitat, isOcean }
        }));

        const label = selectedHabitat === 'all' ? 'all habitats' : `the ${selectedHabitat} collection`;
        filterStatus.textContent = `Showing ${visibleCount} ${visibleCount === 1 ? 'animal' : 'animals'} from ${label}.`;
    });
});
