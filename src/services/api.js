/**
 * VigiSaúde Brasil — API Service
 * Integrates: InfoDengue, IBGE Localidades, IBGE Malhas, SNIS (Saneamento)
 */

// ===== Cache =====
const cache = new Map();

function cacheKey(...args) {
    return args.join('|');
}

async function cachedFetch(key, fetcher) {
    if (cache.has(key)) return cache.get(key);
    const data = await fetcher();
    cache.set(key, data);
    return data;
}

// ===== IBGE Localidades =====

export async function fetchStates() {
    return cachedFetch('states', async () => {
        const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        if (!res.ok) throw new Error('Falha ao carregar estados');
        return res.json();
    });
}

export async function fetchMunicipios(ufId) {
    return cachedFetch(`municipios-${ufId}`, async () => {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufId}/municipios?orderBy=nome`);
        if (!res.ok) throw new Error('Falha ao carregar municípios');
        return res.json();
    });
}

// ===== IBGE Malhas (GeoJSON) =====

export async function fetchBrazilGeoJSON() {
    return cachedFetch('brazil-geo', async () => {
        const res = await fetch('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF');
        if (!res.ok) throw new Error('Falha ao carregar malha geográfica');
        return res.json();
    });
}

// ===== InfoDengue API =====

export async function fetchDiseaseData(geocode, disease = 'dengue', ewStart = 1, ewEnd = 52, eyStart = 2025, eyEnd = 2025) {
    const key = cacheKey('disease', geocode, disease, ewStart, ewEnd, eyStart, eyEnd);
    return cachedFetch(key, async () => {
        // Use proxy in dev to avoid CORS, direct URL in production
        const baseUrl = import.meta.env.DEV ? '/api/infodengue' : 'https://info.dengue.mat.br/api';
        const url = `${baseUrl}/alertcity?geocode=${geocode}&disease=${disease}&format=json&ew_start=${ewStart}&ew_end=${ewEnd}&ey_start=${eyStart}&ey_end=${eyEnd}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Falha ao carregar dados de ${disease}`);
        const data = await res.json();
        // Sort by epidemiological week
        return data.sort((a, b) => a.SE - b.SE);
    });
}

// Fetch alert data for multiple capital cities (for national overview)
export async function fetchNationalOverview(disease = 'dengue') {
    const key = cacheKey('national', disease);
    return cachedFetch(key, async () => {
        // Brazilian state capitals with their IBGE geocodes
        const capitals = [
            { name: 'São Paulo', geocode: 3550308, uf: 'SP' },
            { name: 'Rio de Janeiro', geocode: 3304557, uf: 'RJ' },
            { name: 'Belo Horizonte', geocode: 3106200, uf: 'MG' },
            { name: 'Salvador', geocode: 2927408, uf: 'BA' },
            { name: 'Brasília', geocode: 5300108, uf: 'DF' },
            { name: 'Fortaleza', geocode: 2304400, uf: 'CE' },
            { name: 'Manaus', geocode: 1302603, uf: 'AM' },
            { name: 'Curitiba', geocode: 4106902, uf: 'PR' },
            { name: 'Recife', geocode: 2611606, uf: 'PE' },
            { name: 'Goiânia', geocode: 5208707, uf: 'GO' },
            { name: 'Belém', geocode: 1501402, uf: 'PA' },
            { name: 'Porto Alegre', geocode: 4314902, uf: 'RS' },
            { name: 'São Luís', geocode: 2111300, uf: 'MA' },
            { name: 'Maceió', geocode: 2704302, uf: 'AL' },
            { name: 'Campo Grande', geocode: 5002704, uf: 'MS' },
            { name: 'Natal', geocode: 2408102, uf: 'RN' },
            { name: 'Teresina', geocode: 2211001, uf: 'PI' },
            { name: 'João Pessoa', geocode: 2507507, uf: 'PB' },
            { name: 'Aracaju', geocode: 2800308, uf: 'SE' },
            { name: 'Cuiabá', geocode: 5103403, uf: 'MT' },
            { name: 'Florianópolis', geocode: 4205407, uf: 'SC' },
            { name: 'Vitória', geocode: 3205309, uf: 'ES' },
            { name: 'Porto Velho', geocode: 1100205, uf: 'RO' },
            { name: 'Macapá', geocode: 1600303, uf: 'AP' },
            { name: 'Rio Branco', geocode: 1200401, uf: 'AC' },
            { name: 'Boa Vista', geocode: 1400100, uf: 'RR' },
            { name: 'Palmas', geocode: 1721000, uf: 'TO' },
        ];

        // Fetch latest week for each capital (last 4 weeks)
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        // Calculate approximate epidemiological week
        const startOfYear = new Date(currentYear, 0, 1);
        const dayOfYear = Math.floor((currentDate - startOfYear) / 86400000);
        const currentEW = Math.min(Math.ceil(dayOfYear / 7), 52);
        const startEW = Math.max(1, currentEW - 4);

        const results = await Promise.allSettled(
            capitals.map(async (cap) => {
                try {
                    const data = await fetchDiseaseData(cap.geocode, disease, startEW, currentEW, currentYear, currentYear);
                    const latest = data.length > 0 ? data[data.length - 1] : null;
                    return { ...cap, data, latest };
                } catch {
                    return { ...cap, data: [], latest: null };
                }
            })
        );

        return results
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);
    });
}

// ===== SNIS — Sanitation (Sewage) Data =====
// We use pre-built data representing sewage coverage by state
// Source: SNIS 2023 / Atlas Esgotos - ANA
// Columns: % population with sewage collection, % sewage treated

export function getSanitationData() {
    // Latest available SNIS data (reference year 2022/2023)
    // Source: SNIS - Diagnóstico Temático Serviços de Água e Esgoto
    return {
        AC: { coletaEsgoto: 14.4, tratamentoEsgoto: 20.8, idh: 0.663, nome: 'Acre' },
        AL: { coletaEsgoto: 29.6, tratamentoEsgoto: 30.1, idh: 0.631, nome: 'Alagoas' },
        AM: { coletaEsgoto: 14.2, tratamentoEsgoto: 33.5, idh: 0.674, nome: 'Amazonas' },
        AP: { coletaEsgoto: 6.1, tratamentoEsgoto: 11.8, idh: 0.708, nome: 'Amapá' },
        BA: { coletaEsgoto: 35.8, tratamentoEsgoto: 52.4, idh: 0.660, nome: 'Bahia' },
        CE: { coletaEsgoto: 29.9, tratamentoEsgoto: 42.1, idh: 0.682, nome: 'Ceará' },
        DF: { coletaEsgoto: 90.5, tratamentoEsgoto: 82.3, idh: 0.824, nome: 'Distrito Federal' },
        ES: { coletaEsgoto: 57.4, tratamentoEsgoto: 51.7, idh: 0.740, nome: 'Espírito Santo' },
        GO: { coletaEsgoto: 58.0, tratamentoEsgoto: 67.3, idh: 0.735, nome: 'Goiás' },
        MA: { coletaEsgoto: 13.7, tratamentoEsgoto: 17.8, idh: 0.639, nome: 'Maranhão' },
        MG: { coletaEsgoto: 71.4, tratamentoEsgoto: 46.5, idh: 0.731, nome: 'Minas Gerais' },
        MS: { coletaEsgoto: 46.5, tratamentoEsgoto: 62.8, idh: 0.729, nome: 'Mato Grosso do Sul' },
        MT: { coletaEsgoto: 36.2, tratamentoEsgoto: 63.7, idh: 0.725, nome: 'Mato Grosso' },
        PA: { coletaEsgoto: 8.4, tratamentoEsgoto: 15.2, idh: 0.646, nome: 'Pará' },
        PB: { coletaEsgoto: 36.7, tratamentoEsgoto: 43.2, idh: 0.658, nome: 'Paraíba' },
        PE: { coletaEsgoto: 32.8, tratamentoEsgoto: 39.5, idh: 0.673, nome: 'Pernambuco' },
        PI: { coletaEsgoto: 12.8, tratamentoEsgoto: 22.1, idh: 0.646, nome: 'Piauí' },
        PR: { coletaEsgoto: 74.4, tratamentoEsgoto: 83.1, idh: 0.749, nome: 'Paraná' },
        RJ: { coletaEsgoto: 65.3, tratamentoEsgoto: 41.8, idh: 0.761, nome: 'Rio de Janeiro' },
        RN: { coletaEsgoto: 26.9, tratamentoEsgoto: 34.7, idh: 0.684, nome: 'Rio Grande do Norte' },
        RO: { coletaEsgoto: 7.5, tratamentoEsgoto: 13.9, idh: 0.690, nome: 'Rondônia' },
        RR: { coletaEsgoto: 22.6, tratamentoEsgoto: 41.2, idh: 0.707, nome: 'Roraima' },
        RS: { coletaEsgoto: 33.2, tratamentoEsgoto: 44.6, idh: 0.746, nome: 'Rio Grande do Sul' },
        SC: { coletaEsgoto: 30.8, tratamentoEsgoto: 46.2, idh: 0.774, nome: 'Santa Catarina' },
        SE: { coletaEsgoto: 23.0, tratamentoEsgoto: 36.8, idh: 0.665, nome: 'Sergipe' },
        SP: { coletaEsgoto: 89.6, tratamentoEsgoto: 73.4, idh: 0.783, nome: 'São Paulo' },
        TO: { coletaEsgoto: 27.4, tratamentoEsgoto: 55.3, idh: 0.699, nome: 'Tocantins' },
    };
}

// ===== UF code to abbreviation mapping =====
export function getUFAbbreviation(ufId) {
    const map = {
        11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
        21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
        31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
        41: 'PR', 42: 'SC', 43: 'RS',
        50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
    };
    return map[ufId] || '';
}

// ===== Region mapping =====
export function getRegionForUF(ufAbbr) {
    const regions = {
        norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
        nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
        sudeste: ['ES', 'MG', 'RJ', 'SP'],
        sul: ['PR', 'RS', 'SC'],
        'centro-oeste': ['DF', 'GO', 'MS', 'MT']
    };
    for (const [region, ufs] of Object.entries(regions)) {
        if (ufs.includes(ufAbbr)) return region;
    }
    return 'all';
}

// ===== Alert Level helpers =====
export function getAlertLevel(nivel) {
    const levels = {
        1: { label: 'Verde', color: 'var(--alert-green)', bg: 'rgba(34, 197, 94, 0.15)', class: 'badge--green' },
        2: { label: 'Atenção', color: 'var(--alert-yellow)', bg: 'rgba(234, 179, 8, 0.15)', class: 'badge--yellow' },
        3: { label: 'Alerta', color: 'var(--alert-orange)', bg: 'rgba(249, 115, 22, 0.15)', class: 'badge--orange' },
        4: { label: 'Emergência', color: 'var(--alert-red)', bg: 'rgba(239, 68, 68, 0.15)', class: 'badge--red' },
    };
    return levels[nivel] || levels[1];
}

export function getAlertColorHex(nivel) {
    const colors = { 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444' };
    return colors[nivel] || colors[1];
}

// ===== Disease display info =====
export function getDiseaseInfo(disease) {
    const info = {
        dengue: { name: 'Dengue', icon: '🦟', color: 'var(--color-dengue)', colorHex: '#f59e0b' },
        chikungunya: { name: 'Chikungunya', icon: '🦠', color: 'var(--color-chikungunya)', colorHex: '#ec4899' },
        zika: { name: 'Zika', icon: '🧬', color: 'var(--color-zika)', colorHex: '#8b5cf6' },
    };
    return info[disease] || info.dengue;
}

// Chart colors for multiple series
export const CHART_COLORS = [
    '#38bdf8', '#f59e0b', '#34d399', '#ec4899', '#a78bfa',
    '#fb923c', '#22d3ee', '#f472b6', '#4ade80', '#c084fc'
];
