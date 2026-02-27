/**
 * VigiSaúde Brasil — Map Component
 * Interactive Leaflet map of Brazil with disease alert overlay and sewage data
 */
import L from 'leaflet';
import { fetchBrazilGeoJSON, getUFAbbreviation, getSanitationData, getAlertColorHex, getRegionForUF } from '../services/api.js';

let map = null;
let geoLayer = null;
let currentRegion = 'all';
let onStateClick = null;

const regionBounds = {
    all: [[-33.75, -73.99], [5.27, -34.79]],
    norte: [[-3.0, -74.0], [5.3, -44.0]],
    nordeste: [[-18.0, -49.0], [-1.0, -34.8]],
    sudeste: [[-25.5, -53.5], [-14.0, -39.5]],
    sul: [[-33.8, -57.7], [-22.5, -48.0]],
    'centro-oeste': [[-24.5, -61.5], [-5.5, -45.5]],
};

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

    return map;
}

export async function loadGeoJSON(capitalData = []) {
    const loadingEl = document.getElementById('map-loading');

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

                // Determine fill color based on alert level or sewage data
                let fillColor = '#1e293b';
                let fillOpacity = 0.6;

                if (currentRegion !== 'all' && region !== currentRegion) {
                    fillOpacity = 0.15;
                }

                const capData = diseaseByUF[ufAbbr];
                if (capData && capData.latest) {
                    fillColor = getAlertColorHex(capData.latest.nivel);
                    fillOpacity = currentRegion !== 'all' && region !== currentRegion ? 0.15 : 0.55;
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
                    popupHTML += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(148,163,184,0.15)">`;
                    popupHTML += `<span class="popup-stat__label" style="display:block;margin-bottom:4px">🚰 Saneamento (SNIS)</span>`;
                    popupHTML += `<div class="popup-stats">`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Coleta Esgoto</span><span class="popup-stat__value">${sanitation.coletaEsgoto}%</span></div>`;
                    popupHTML += `<div class="popup-stat"><span class="popup-stat__label">Trat. Esgoto</span><span class="popup-stat__value">${sanitation.tratamentoEsgoto}%</span></div>`;
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
