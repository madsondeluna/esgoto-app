/**
 * VigiSaúde Brasil — Filters & Controls Component
 * Region filters, state/city selectors, period controls, search
 */
import { fetchStates, fetchMunicipios, getUFAbbreviation } from '../services/api.js';

let states = [];
let onRegionChange = null;
let onSearchSelect = null;

// ===== Region Filters =====
export function initRegionFilters(callback) {
    onRegionChange = callback;
    const buttons = document.querySelectorAll('.region-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (onRegionChange) onRegionChange(btn.dataset.region);
        });
    });
}

// ===== State & City Selectors (Tracker) =====
export async function initTrackerSelectors(onAddLocation) {
    const stateSelect = document.getElementById('tracker-state');
    const citySelect = document.getElementById('tracker-city');
    const addBtn = document.getElementById('add-location-btn');

    // Load states
    states = await fetchStates();
    states.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.sigla} - ${s.nome}`;
        stateSelect.appendChild(opt);
    });

    // On state change → load cities
    stateSelect.addEventListener('change', async () => {
        const ufId = stateSelect.value;
        citySelect.innerHTML = '<option value="">Carregando...</option>';
        citySelect.disabled = true;
        addBtn.disabled = true;

        if (!ufId) {
            citySelect.innerHTML = '<option value="">Selecione um município</option>';
            return;
        }

        try {
            const municipios = await fetchMunicipios(ufId);
            citySelect.innerHTML = '<option value="">Selecione um município</option>';
            municipios.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.nome;
                citySelect.appendChild(opt);
            });
            citySelect.disabled = false;
        } catch (err) {
            citySelect.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    });

    // On city change → enable add
    citySelect.addEventListener('change', () => {
        addBtn.disabled = !citySelect.value;
    });

    // Add location
    addBtn.addEventListener('click', () => {
        const geocode = citySelect.value;
        const cityName = citySelect.options[citySelect.selectedIndex].text;
        const stateSigla = stateSelect.options[stateSelect.selectedIndex].text.split(' - ')[0];
        if (geocode && onAddLocation) {
            onAddLocation(geocode, `${cityName}, ${stateSigla}`);
        }
    });
}

// ===== Period Controls =====
export function initPeriodControls() {
    const ewStart = document.getElementById('ew-start');
    const ewEnd = document.getElementById('ew-end');
    const eyStart = document.getElementById('ey-start');
    const eyEnd = document.getElementById('ey-end');

    // Populate weeks 1-52
    for (let w = 1; w <= 52; w++) {
        const optS = document.createElement('option');
        optS.value = w;
        optS.textContent = `SE ${w}`;
        ewStart.appendChild(optS);

        const optE = document.createElement('option');
        optE.value = w;
        optE.textContent = `SE ${w}`;
        ewEnd.appendChild(optE);
    }

    // Populate years
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2020; y--) {
        const optS = document.createElement('option');
        optS.value = y;
        optS.textContent = y;
        eyStart.appendChild(optS);

        const optE = document.createElement('option');
        optE.value = y;
        optE.textContent = y;
        eyEnd.appendChild(optE);
    }

    // Set defaults
    ewStart.value = 1;
    const dayOfYear = Math.floor((new Date() - new Date(currentYear, 0, 1)) / 86400000);
    ewEnd.value = Math.min(Math.ceil(dayOfYear / 7), 52);
    eyStart.value = currentYear;
    eyEnd.value = currentYear;
}

export function getPeriod() {
    return {
        ewStart: parseInt(document.getElementById('ew-start').value) || 1,
        ewEnd: parseInt(document.getElementById('ew-end').value) || 52,
        eyStart: parseInt(document.getElementById('ey-start').value) || 2025,
        eyEnd: parseInt(document.getElementById('ey-end').value) || 2025,
    };
}

// ===== Search (Map view) =====
export async function initSearch(callback) {
    onSearchSelect = callback;
    const input = document.getElementById('location-search');
    const resultsDiv = document.getElementById('search-results');
    let debounceTimer = null;
    let allMunicipios = null;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim().toLowerCase();

        if (query.length < 2) {
            resultsDiv.classList.add('hidden');
            resultsDiv.innerHTML = '';
            return;
        }

        debounceTimer = setTimeout(async () => {
            // Lazy load all municipios
            if (!allMunicipios) {
                try {
                    const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
                    allMunicipios = await res.json();
                } catch { return; }
            }

            const matches = allMunicipios
                .filter(m => m.nome.toLowerCase().includes(query))
                .slice(0, 15);

            if (matches.length === 0) {
                resultsDiv.innerHTML = '<div class="search-result-item" style="color:var(--text-tertiary)">Nenhum resultado</div>';
                resultsDiv.classList.remove('hidden');
                return;
            }

            resultsDiv.innerHTML = matches.map(m => {
                const ufSigla = m.microrregiao?.mesorregiao?.UF?.sigla || '';
                return `<div class="search-result-item" data-geocode="${m.id}" data-name="${m.nome}" data-uf="${ufSigla}">
          ${m.nome}<span class="search-result-item__state">${ufSigla}</span>
        </div>`;
            }).join('');

            resultsDiv.classList.remove('hidden');

            // Click handler
            resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const geocode = item.dataset.geocode;
                    const name = `${item.dataset.name}, ${item.dataset.uf}`;
                    input.value = item.dataset.name;
                    resultsDiv.classList.add('hidden');
                    if (onSearchSelect) onSearchSelect(geocode, name);
                });
            });
        }, 300);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            resultsDiv.classList.add('hidden');
        }
    });
}

// ===== Pathogen Tag Selector =====
export function initPathogenTags(callback) {
    const tags = document.querySelectorAll('.pathogen-tag');
    tags.forEach(tag => {
        tag.addEventListener('click', () => {
            tags.forEach(t => t.classList.remove('active'));
            tag.classList.add('active');
            const disease = tag.dataset.disease;
            document.getElementById('tracker-disease-type').textContent =
                disease.charAt(0).toUpperCase() + disease.slice(1);
            if (callback) callback(disease);
        });
    });
}

// ===== Category Tabs =====
export function initCategoryTabs() {
    const tabs = document.querySelectorAll('.category-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // Category filtering can be extended in the future
        });
    });
}

// ===== Chart View Toggle =====
export function initChartToggle(callback) {
    const buttons = document.querySelectorAll('.chart-toggle-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (callback) callback(btn.dataset.chart);
        });
    });
}
