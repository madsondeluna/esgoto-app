/**
 * VigiSaúde Brasil — Disease Cards Component
 * Sidebar cards showing disease status with alert levels and mini stats
 */
import { getDiseaseInfo, getAlertLevel } from '../services/api.js';

let activeDisease = 'dengue';
let onDiseaseChange = null;

export function initCards(container, callback) {
    onDiseaseChange = callback;
    renderCards(container);
}

/**
 * Render disease cards.
 * @param {HTMLElement} container
 * @param {Object|null} diseaseDataMap  –  { dengue: [...], chikungunya: [...], zika: [...] }
 */
export function renderCards(container, diseaseDataMap = null) {
    const diseases = ['dengue', 'chikungunya', 'zika'];
    container.innerHTML = '';

    diseases.forEach(disease => {
        const info = getDiseaseInfo(disease);
        const isActive = disease === activeDisease;

        // Use per-disease data if available
        const nationalData = diseaseDataMap && diseaseDataMap[disease]
            ? diseaseDataMap[disease]
            : null;

        // Aggregate data from national overview
        let totalCases = 0;
        let avgRt = 0;
        let maxLevel = 1;
        let validRtCount = 0;
        let dataYear = new Date().getFullYear();

        if (nationalData && Array.isArray(nationalData)) {
            nationalData.forEach(cap => {
                if (cap.latest) {
                    totalCases += cap.latest.notif_accum_year || 0;
                    if (cap.latest.Rt) {
                        avgRt += cap.latest.Rt;
                        validRtCount++;
                    }
                    if (cap.latest.nivel > maxLevel) maxLevel = cap.latest.nivel;
                }
                if (cap.dataYear) dataYear = cap.dataYear;
            });
            if (validRtCount > 0) avgRt /= validRtCount;
        }

        const currentYear = new Date().getFullYear();
        const isOldData = dataYear < currentYear;

        const alertInfo = getAlertLevel(maxLevel);

        const card = document.createElement('div');
        card.className = `disease-card ${isActive ? 'active' : ''}`;
        card.style.setProperty('--card-accent', info.color);
        card.dataset.disease = disease;

        card.innerHTML = `
      <div class="disease-card__header">
        <span class="disease-card__name">${info.icon} ${info.name}</span>
        <span class="disease-card__badge badge ${alertInfo.class}">${alertInfo.label}</span>
      </div>
      <div class="disease-card__stats">
        <div class="disease-card__stat">
          <span class="disease-card__stat-value">${totalCases.toLocaleString('pt-BR')}</span>
          <span class="disease-card__stat-label">Casos totais</span>
        </div>
        <div class="disease-card__stat">
          <span class="disease-card__stat-value">${validRtCount > 0 ? avgRt.toFixed(2) : '0.00'}</span>
          <span class="disease-card__stat-label">Rt médio</span>
        </div>
      </div>
      ${isOldData ? `<div class="disease-card__year-note">⚠ Dados de ${dataYear}</div>` : ''}
    `;

        card.addEventListener('click', () => {
            activeDisease = disease;
            if (onDiseaseChange) onDiseaseChange(disease);
            renderCards(container, diseaseDataMap);
        });

        container.appendChild(card);
    });
}

export function getActiveDisease() {
    return activeDisease;
}

export function setActiveDisease(disease) {
    activeDisease = disease;
}

// ===== Update National Summary Stats =====
export function updateNationalSummary(nationalData) {
    const totalCasesEl = document.getElementById('total-cases');
    const totalCitiesEl = document.getElementById('total-cities');
    const avgRtEl = document.getElementById('avg-rt');
    const maxIncEl = document.getElementById('max-inc');
    const maxIncLabelEl = document.getElementById('max-inc-label');
    const distEl = document.getElementById('alert-distribution');

    if (!nationalData || nationalData.length === 0) return;

    let totalCases = 0;
    let alertCities = 0;
    let avgRt = 0;
    let rtCount = 0;
    let maxInc = 0;
    let maxIncCity = '';
    let level1 = 0, level2 = 0, level3 = 0, level4 = 0;

    nationalData.forEach(cap => {
        if (cap.latest) {
            totalCases += cap.latest.notif_accum_year || 0;
            if (cap.latest.nivel >= 3) alertCities++;
            if (cap.latest.Rt) { avgRt += cap.latest.Rt; rtCount++; }

            const nivel = cap.latest.nivel || 1;
            if (nivel === 1) level1++;
            else if (nivel === 2) level2++;
            else if (nivel === 3) level3++;
            else if (nivel === 4) level4++;

            const inc = cap.latest.p_inc100k || 0;
            if (inc > maxInc) { maxInc = inc; maxIncCity = cap.name; }
        }
    });

    if (rtCount > 0) avgRt /= rtCount;

    if (totalCasesEl) totalCasesEl.textContent = totalCases.toLocaleString('pt-BR');
    if (totalCitiesEl) totalCitiesEl.textContent = alertCities;
    if (avgRtEl) avgRtEl.textContent = avgRt.toFixed(2);
    if (maxIncEl) maxIncEl.textContent = maxInc > 0 ? maxInc.toFixed(1) : '--';
    if (maxIncLabelEl && maxIncCity) maxIncLabelEl.textContent = `Maior incidência/100k (${maxIncCity})`;

    // Alert level distribution
    const n1El = document.getElementById('alert-n1');
    const n2El = document.getElementById('alert-n2');
    const n3El = document.getElementById('alert-n3');
    const n4El = document.getElementById('alert-n4');
    if (n1El) n1El.textContent = `● ${level1} verde`;
    if (n2El) n2El.textContent = `● ${level2} atenção`;
    if (n3El) n3El.textContent = `● ${level3} alerta`;
    if (n4El) n4El.textContent = `● ${level4} emergência`;
    if (distEl) distEl.style.display = 'flex';
}
