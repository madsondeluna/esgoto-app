/**
 * VigiSaúde Brasil — Map Component
 * Interactive Leaflet map of Brazil with disease alert overlay and sewage data
 * Supports municipality-level heatmap on zoom
 */
import L from 'leaflet';
import {
    fetchBrazilGeoJSON, fetchStateGeoJSON, fetchBulkMunicipioAlerts,
    getUFAbbreviation, getSanitationData, getAlertColorHex, getRegionForUF,
    MAJOR_CITIES_BY_UF
} from '../services/api.js';

let map = null;
let geoLayer = null;       // State-level layer
let currentRegion = 'all';
let onStateClick = null;
let currentDisease = 'dengue';
let currentMapLayer = 'disease';  // 'disease' | 'coletaEsgoto' | 'tratamentoEsgoto'
let lastCapitalData = [];

// Municipality zoom management
const MUNICIPIO_ZOOM_THRESHOLD = 6;
const loadedMunicipioLayers = {};  // { ufId: L.geoJSON layer }
const loadingStates = new Set();   // UF IDs currently being fetched
const municipioAlertCache = {};    // { ufId: { geocode: alertData } }

const regionBounds = {
    all: [[-33.75, -73.99], [5.27, -34.79]],
    norte: [[-3.0, -74.0], [5.3, -44.0]],
    nordeste: [[-18.0, -49.0], [-1.0, -34.8]],
    sudeste: [[-25.5, -53.5], [-14.0, -39.5]],
    sul: [[-33.8, -57.7], [-22.5, -48.0]],
    'centro-oeste': [[-24.5, -61.5], [-5.5, -45.5]],
};

// UF ID to number mapping (from codarea in IBGE GeoJSON)
const UF_IDS = [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35, 41, 42, 43, 50, 51, 52, 53];

export function initMap(containerId, stateClickCallback) {
    onStateClick = stateClickCallback;

    map = L.map(containerId, {
        center: [-14.5, -51.0],
        zoom: 4,
        minZoom: 3,
        maxZoom: 12,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> | Dados: InfoDengue, IBGE, SNIS',
        subdomains: 'abcd',
        maxZoom: 19,
    }).addTo(map);

    // Listen for zoom changes to manage municipality layers
    map.on('zoomend', handleZoomChange);
    map.on('moveend', handleZoomChange);

    return map;
}

// ===== Zoom Handler =====
function handleZoomChange() {
    const zoom = map.getZoom();

    if (zoom >= MUNICIPIO_ZOOM_THRESHOLD) {
        // Find which states are visible in the viewport
        const bounds = map.getBounds();
        const visibleUFs = getVisibleUFs(bounds);
        visibleUFs.forEach(ufId => loadMunicipioLayer(ufId));

        // Fade out state layer when zoomed in
        if (geoLayer) {
            geoLayer.setStyle({ fillOpacity: 0.1, weight: 0.5 });
        }
    } else {
        // Remove all municipality layers when zoomed out
        removeMunicipioLayers();

        // Restore state layer opacity
        if (geoLayer) {
            geoLayer.eachLayer(layer => {
                geoLayer.resetStyle(layer);
            });
        }
    }
}

// ===== Determine which UF IDs are visible in viewport =====
function getVisibleUFs(bounds) {
    if (!geoLayer) return [];

    const visible = [];
    geoLayer.eachLayer(layer => {
        if (layer.feature && layer.getBounds) {
            try {
                const layerBounds = layer.getBounds();
                if (bounds.intersects(layerBounds)) {
                    const ufId = Number(layer.feature.properties.codarea);
                    if (UF_IDS.includes(ufId)) {
                        visible.push(ufId);
                    }
                }
            } catch { /* skip */ }
        }
    });
    return visible;
}

// ===== Load Municipality Layer for a State =====
async function loadMunicipioLayer(ufId) {
    // Skip if already loaded or currently loading
    if (loadedMunicipioLayers[ufId] || loadingStates.has(ufId)) return;

    // Check if this UF has major cities data
    if (!MAJOR_CITIES_BY_UF[ufId]) return;

    loadingStates.add(ufId);

    try {
        // Fetch municipality GeoJSON and disease alerts in parallel
        const [geojson, alertMap] = await Promise.all([
            fetchStateGeoJSON(ufId),
            fetchBulkMunicipioAlerts(MAJOR_CITIES_BY_UF[ufId], currentDisease),
        ]);

        municipioAlertCache[ufId] = alertMap;

        // Create municipality layer
        const municipioLayer = L.geoJSON(geojson, {
            style: (feature) => {
                const geocode = Number(feature.properties.codarea);
                const alert = alertMap[geocode];

                let fillColor = 'rgba(30, 41, 59, 0.4)';
                let fillOpacity = 0.25;

                if (alert) {
                    fillColor = getAlertColorHex(alert.nivel);
                    fillOpacity = 0.6;
                }

                return {
                    fillColor,
                    fillOpacity,
                    weight: 0.8,
                    color: 'rgba(148, 163, 184, 0.25)',
                    dashArray: '',
                };
            },
            onEachFeature: (feature, layer) => {
                const geocode = Number(feature.properties.codarea);
                const alert = alertMap[geocode];

                if (alert) {
                    const alertInfo = { 1: 'Verde', 2: 'Atenção', 3: 'Alerta', 4: 'Emergência' };
                    const alertClass = { 1: 'badge--green', 2: 'badge--yellow', 3: 'badge--orange', 4: 'badge--red' };

                    let popupHTML = `<div class="popup-content">`;
                    popupHTML += `<h4>${alert.municipio_nome || `Município ${geocode}`}</h4>`;
                    popupHTML += `<div class="popup-stats">`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Casos (SE ${alert.SE % 100})</span><span class="popup-stat__value">${(alert.casos || 0).toLocaleString('pt-BR')}</span></div>`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Rt</span><span class="popup-stat__value">${alert.Rt ? alert.Rt.toFixed(2) : '--'}</span></div>`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Inc/100k</span><span class="popup-stat__value">${alert.p_inc100k ? alert.p_inc100k.toFixed(1) : '--'}</span></div>`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Acum. Ano</span><span class="popup-stat__value">${(alert.notif_accum_year || 0).toLocaleString('pt-BR')}</span></div>`;
                    popupHTML += `</div>`;
                    popupHTML += `<span class="popup-alert-badge badge ${alertClass[alert.nivel] || 'badge--green'}">${alertInfo[alert.nivel] || 'Verde'}</span>`;
                    popupHTML += `</div>`;
                    layer.bindPopup(popupHTML);
                }

                // Hover effects
                layer.on('mouseover', function () {
                    this.setStyle({
                        weight: 2,
                        color: '#38bdf8',
                        fillOpacity: alert ? 0.8 : 0.35,
                    });
                    this.bringToFront();
                });

                layer.on('mouseout', function () {
                    municipioLayer.resetStyle(this);
                });
            },
        });

        municipioLayer.addTo(map);
        loadedMunicipioLayers[ufId] = municipioLayer;

    } catch (err) {
        console.error(`Erro ao carregar municípios da UF ${ufId}:`, err);
    } finally {
        loadingStates.delete(ufId);
    }
}

// ===== Remove all municipality layers =====
function removeMunicipioLayers() {
    for (const ufId of Object.keys(loadedMunicipioLayers)) {
        if (loadedMunicipioLayers[ufId]) {
            map.removeLayer(loadedMunicipioLayers[ufId]);
            delete loadedMunicipioLayers[ufId];
        }
    }
}

// ===== Update disease for municipality layers =====
export function setMapDisease(disease) {
    currentDisease = disease;
    // Clear cached municipality data so it reloads with new disease
    for (const ufId of Object.keys(loadedMunicipioLayers)) {
        if (loadedMunicipioLayers[ufId]) {
            map.removeLayer(loadedMunicipioLayers[ufId]);
            delete loadedMunicipioLayers[ufId];
        }
        delete municipioAlertCache[ufId];
    }
    // Reload if zoomed in
    if (map && map.getZoom() >= MUNICIPIO_ZOOM_THRESHOLD) {
        handleZoomChange();
    }
}

// ===== Sanitation color gradient (blue scale) =====
function getSanitationColor(percent) {
    // 0% → dark/red, 100% → bright cyan
    if (percent >= 80) return '#06b6d4'; // cyan-500
    if (percent >= 60) return '#22d3ee'; // cyan-400
    if (percent >= 40) return '#67e8f9'; // cyan-300
    if (percent >= 20) return '#f59e0b'; // amber-500 (low-moderate)
    return '#ef4444';                    // red-500 (very low)
}

function getSanitationOpacity(percent) {
    return 0.35 + (percent / 100) * 0.4; // range: 0.35 – 0.75
}

// ===== Set Map Layer =====
export function setMapLayer(layer) {
    currentMapLayer = layer;
    updateLegend(layer);
    if (geoLayer) {
        loadGeoJSON(lastCapitalData);
    }
}

function updateLegend(layer) {
    const legendEl = document.getElementById('map-legend');
    if (!legendEl) return;

    if (layer === 'disease') {
        legendEl.innerHTML = `
            <div class="legend-item"><span class="legend-color" style="background: var(--alert-green)"></span>Nível 1 — Verde</div>
            <div class="legend-item"><span class="legend-color" style="background: var(--alert-yellow)"></span>Nível 2 — Atenção</div>
            <div class="legend-item"><span class="legend-color" style="background: var(--alert-orange)"></span>Nível 3 — Alerta</div>
            <div class="legend-item"><span class="legend-color" style="background: var(--alert-red)"></span>Nível 4 — Emergência</div>
        `;
    } else {
        const label = layer === 'coletaEsgoto' ? 'Coleta de Esgoto' : 'Tratamento de Esgoto';
        legendEl.innerHTML = `
            <div class="legend-item"><span class="legend-color" style="background: #06b6d4"></span>≥ 80% ${label}</div>
            <div class="legend-item"><span class="legend-color" style="background: #22d3ee"></span>60–79%</div>
            <div class="legend-item"><span class="legend-color" style="background: #67e8f9"></span>40–59%</div>
            <div class="legend-item"><span class="legend-color" style="background: #f59e0b"></span>20–39%</div>
            <div class="legend-item"><span class="legend-color" style="background: #ef4444"></span>< 20%</div>
        `;
    }
}

// ===== Load State-Level GeoJSON =====
export async function loadGeoJSON(capitalData = []) {
    const loadingEl = document.getElementById('map-loading');
    lastCapitalData = capitalData;

    try {
        const geojson = await fetchBrazilGeoJSON();
        const sanitationData = getSanitationData();

        // Build a quick lookup: UF abbreviation → latest disease data
        const diseaseByUF = {};
        if (capitalData.length > 0) {
            capitalData.forEach(cap => {
                if (cap.latest) {
                    diseaseByUF[cap.uf] = cap;
                }
            });
        }

        if (geoLayer) {
            map.removeLayer(geoLayer);
        }

        geoLayer = L.geoJSON(geojson, {
            style: (feature) => {
                const ufId = feature.properties.codarea;
                const ufAbbr = getUFAbbreviation(Number(ufId));
                const region = getRegionForUF(ufAbbr);
                const sanitation = sanitationData[ufAbbr];

                let fillColor = '#1e293b';
                let fillOpacity = 0.6;

                if (currentRegion !== 'all' && region !== currentRegion) {
                    fillOpacity = 0.15;
                }

                if (currentMapLayer === 'disease') {
                    // Disease alert coloring
                    const capData = diseaseByUF[ufAbbr];
                    if (capData && capData.latest) {
                        fillColor = getAlertColorHex(capData.latest.nivel);
                        fillOpacity = currentRegion !== 'all' && region !== currentRegion ? 0.15 : 0.55;
                    }
                } else if (sanitation) {
                    // Sanitation layer coloring
                    const val = sanitation[currentMapLayer] || 0;
                    fillColor = getSanitationColor(val);
                    fillOpacity = currentRegion !== 'all' && region !== currentRegion ? 0.15 : getSanitationOpacity(val);
                }

                // If zoomed in, make states translucent
                if (map.getZoom() >= MUNICIPIO_ZOOM_THRESHOLD) {
                    fillOpacity = 0.1;
                }

                return {
                    fillColor,
                    fillOpacity,
                    weight: 1.5,
                    color: 'rgba(148, 163, 184, 0.3)',
                    dashArray: '',
                };
            },
            onEachFeature: (feature, layer) => {
                const ufId = Number(feature.properties.codarea);
                const ufAbbr = getUFAbbreviation(ufId);
                const sanitation = sanitationData[ufAbbr];
                const capData = diseaseByUF[ufAbbr];

                // Build popup
                let popupHTML = `<div class="popup-content">`;
                popupHTML += `<h4>${sanitation ? sanitation.nome : ufAbbr}</h4>`;

                if (capData && capData.latest) {
                    const d = capData.latest;
                    const alertInfo = { 1: 'Verde', 2: 'Atenção', 3: 'Alerta', 4: 'Emergência' };
                    const alertClass = { 1: 'badge--green', 2: 'badge--yellow', 3: 'badge--orange', 4: 'badge--red' };

                    popupHTML += `<div class="popup-stats">`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Casos (SE ${d.SE % 100})</span><span class="popup-stat__value">${(d.casos || 0).toLocaleString('pt-BR')}</span></div>`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Rt</span><span class="popup-stat__value">${d.Rt ? d.Rt.toFixed(2) : '--'}</span></div>`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Inc/100k</span><span class="popup-stat__value">${d.p_inc100k ? d.p_inc100k.toFixed(1) : '--'}</span></div>`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Acum. Ano</span><span class="popup-stat__value">${(d.notif_accum_year || 0).toLocaleString('pt-BR')}</span></div>`;
                    popupHTML += `</div>`;
                    popupHTML += `<span class="popup-alert-badge badge ${alertClass[d.nivel] || 'badge--green'}">${alertInfo[d.nivel] || 'Verde'}</span>`;
                }

                // Sanitation data
                if (sanitation) {
                    const isActiveSanitation = currentMapLayer !== 'disease';
                    const highlightColeta = currentMapLayer === 'coletaEsgoto' ? 'color:var(--accent-primary);font-weight:600' : '';
                    const highlightTrat = currentMapLayer === 'tratamentoEsgoto' ? 'color:var(--accent-primary);font-weight:600' : '';
                    popupHTML += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(148,163,184,0.15)">`;
                    popupHTML += `<span class="popup-stat__label" style="display:block;margin-bottom:4px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" style="vertical-align:-2px;margin-right:4px"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0L12 2.69z"/></svg>Saneamento (SNIS)</span>`;
                    popupHTML += `<div class="popup-stats">`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label" style="${highlightColeta}">Coleta Esgoto</span><span class="popup-stat__value" style="${highlightColeta}">${sanitation.coletaEsgoto}%</span></div>`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label" style="${highlightTrat}">Trat. Esgoto</span><span class="popup-stat__value" style="${highlightTrat}">${sanitation.tratamentoEsgoto}%</span></div>`;
                    popupHTML += `</div></div>`;
                }

                popupHTML += `</div>`;
                layer.bindPopup(popupHTML);

                // Hover effects
                layer.on('mouseover', function (e) {
                    this.setStyle({
                        weight: 2.5,
                        color: '#38bdf8',
                        fillOpacity: 0.75,
                    });
                    this.bringToFront();
                });

                layer.on('mouseout', function () {
                    geoLayer.resetStyle(this);
                });

                layer.on('click', function () {
                    if (onStateClick) {
                        onStateClick(ufId, ufAbbr, sanitation ? sanitation.nome : ufAbbr);
                    }
                });
            },
        }).addTo(map);

        // Hide loading
        if (loadingEl) loadingEl.classList.add('hidden');

        // Fit bounds
        fitRegion(currentRegion);

    } catch (err) {
        console.error('Erro ao carregar GeoJSON:', err);
        if (loadingEl) {
            loadingEl.innerHTML = '<span style="color: var(--alert-red)">Erro ao carregar mapa</span>';
        }
    }
}

export function fitRegion(region) {
    currentRegion = region;
    const bounds = regionBounds[region] || regionBounds.all;
    map.fitBounds(bounds, { padding: [20, 20], animate: true, duration: 0.5 });
}

export function updateMapColors(capitalData) {
    if (geoLayer) {
        loadGeoJSON(capitalData);
    }
}

export function getMap() {
    return map;
}
