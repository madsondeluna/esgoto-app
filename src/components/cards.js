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

export function renderCards(container, nationalData = null) {
    const diseases = ['dengue', 'chikungunya', 'zika'];
    container.innerHTML = '';

    diseases.forEach(disease => {
        const info = getDiseaseInfo(disease);
        const isActive = disease === activeDisease;

        // Aggregate data from national overview
        let totalCases = 0;
        let avgRt = 0;
        let maxLevel = 1;
        let validRtCount = 0;

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
            });
            if (validRtCount > 0) avgRt /= validRtCount;
        }

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
          <span class="disease-card__stat-value">${totalCases > 0 ? totalCases.toLocaleString('pt-BR') : '--'}</span>
          <span class="disease-card__stat-label">Casos (capitais)</span>
        </div>
        <div class="disease-card__stat">
          <span class="disease-card__stat-value">${validRtCount > 0 ? avgRt.toFixed(2) : '--'}</span>
          <span class="disease-card__stat-label">Rt médio</span>
        </div>
      </div>
    `;

        card.addEventListener('click', () => {
            activeDisease = disease;
            if (onDiseaseChange) onDiseaseChange(disease);
            renderCards(container, nationalData);
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

    if (!nationalData || nationalData.length === 0) return;

    let totalCases = 0;
    let alertCities = 0;
    let avgRt = 0;
    let rtCount = 0;

    nationalData.forEach(cap => {
        if (cap.latest) {
            totalCases += cap.latest.notif_accum_year || 0;
            if (cap.latest.nivel >= 3) alertCities++;
            if (cap.latest.Rt) {
                avgRt += cap.latest.Rt;
                rtCount++;
            }
        }
    });

    if (rtCount > 0) avgRt /= rtCount;

    if (totalCasesEl) totalCasesEl.textContent = totalCases.toLocaleString('pt-BR');
    if (totalCitiesEl) totalCitiesEl.textContent = alertCities;
    if (avgRtEl) avgRtEl.textContent = avgRt.toFixed(2);
}
