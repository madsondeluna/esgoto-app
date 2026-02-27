/**
 * VigiSaúde Brasil — Charts Component
 * Chart.js visualizations: Cases, Rt, Incidence, Climate, Sanitation correlation
 */
import { Chart, registerables } from 'chart.js';
import { CHART_COLORS, getSanitationData, getDiseaseInfo } from '../services/api.js';

Chart.register(...registerables);

// Global Chart.js defaults for dark mode
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.1)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, 0.95)';
Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 13, family: "'Inter', sans-serif" };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12, family: "'Inter', sans-serif" };
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.borderColor = 'rgba(148, 163, 184, 0.15)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.animation = { duration: 600, easing: 'easeOutQuart' };

let mainChart = null;
let rtChart = null;
let incidenceChart = null;
let climateChart = null;

function destroyChart(chart) {
    if (chart) chart.destroy();
    return null;
}

function formatSE(se) {
    const year = Math.floor(se / 100);
    const week = se % 100;
    return `SE ${week}/${year}`;
}

function formatSEShort(se) {
    return `SE ${se % 100}`;
}

// ===== Main Chart: Cases over time =====
export function renderMainChart(datasetsMap, disease = 'dengue', showNational = true) {
    mainChart = destroyChart(mainChart);

    const canvas = document.getElementById('main-chart');
    const emptyState = document.getElementById('chart-empty-state');

    if (!datasetsMap || datasetsMap.size === 0) {
        canvas.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    canvas.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const diseaseInfo = getDiseaseInfo(disease);
    const datasets = [];
    let labels = [];
    let colorIdx = 0;

    for (const [locationName, data] of datasetsMap) {
        if (data.length === 0) continue;

        if (labels.length === 0) {
            labels = data.map(d => formatSEShort(d.SE));
        }

        const color = CHART_COLORS[colorIdx % CHART_COLORS.length];
        datasets.push({
            label: locationName,
            data: data.map(d => d.casos || 0),
            borderColor: color,
            backgroundColor: color + '18',
            fill: datasets.length === 0,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: color,
            borderWidth: 2.5,
        });
        colorIdx++;
    }

    if (datasets.length === 0) return;

    const ctx = canvas.getContext('2d');

    mainChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'start',
                },
                tooltip: {
                    callbacks: {
                        title: (items) => `Semana Epidemiológica ${items[0].label}`,
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('pt-BR')} casos`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                },
                y: {
                    grid: { color: 'rgba(148, 163, 184, 0.08)' },
                    ticks: {
                        callback: (v) => v.toLocaleString('pt-BR'),
                    },
                    title: {
                        display: true,
                        text: 'Número de Casos',
                        font: { size: 11, weight: '500' },
                    },
                },
            },
        },
    });
}

// ===== Rt Chart =====
export function renderRtChart(datasetsMap, showRtLine = true) {
    rtChart = destroyChart(rtChart);
    const canvas = document.getElementById('rt-chart');
    if (!datasetsMap || datasetsMap.size === 0) return;

    const datasets = [];
    let labels = [];
    let colorIdx = 0;

    for (const [locationName, data] of datasetsMap) {
        if (data.length === 0) continue;
        if (labels.length === 0) labels = data.map(d => formatSEShort(d.SE));

        const color = CHART_COLORS[colorIdx % CHART_COLORS.length];
        datasets.push({
            label: locationName,
            data: data.map(d => d.Rt || null),
            borderColor: color,
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2,
            spanGaps: true,
        });
        colorIdx++;
    }

    // Reference line at Rt = 1
    if (showRtLine) {
        datasets.push({
            label: 'Rt = 1 (referência)',
            data: new Array(labels.length).fill(1),
            borderColor: 'rgba(239, 68, 68, 0.5)',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
        });
    }

    const ctx = canvas.getContext('2d');
    rtChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.label.startsWith('Rt =')) return ctx.dataset.label;
                            return `${ctx.dataset.label}: Rt = ${ctx.parsed.y?.toFixed(3) || '--'}`;
                        },
                    },
                },
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
                y: {
                    grid: { color: 'rgba(148, 163, 184, 0.08)' },
                    title: { display: true, text: 'Rt', font: { size: 11 } },
                },
            },
        },
    });
}

// ===== Incidence Chart =====
export function renderIncidenceChart(datasetsMap) {
    incidenceChart = destroyChart(incidenceChart);
    const canvas = document.getElementById('incidence-chart');
    if (!datasetsMap || datasetsMap.size === 0) return;

    const datasets = [];
    let labels = [];
    let colorIdx = 0;

    for (const [locationName, data] of datasetsMap) {
        if (data.length === 0) continue;
        if (labels.length === 0) labels = data.map(d => formatSEShort(d.SE));

        const color = CHART_COLORS[colorIdx % CHART_COLORS.length];
        datasets.push({
            label: locationName,
            data: data.map(d => d.p_inc100k || 0),
            backgroundColor: color + '80',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 3,
        });
        colorIdx++;
    }

    const ctx = canvas.getContext('2d');
    incidenceChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)} por 100k`,
                    },
                },
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
                y: {
                    grid: { color: 'rgba(148, 163, 184, 0.08)' },
                    title: { display: true, text: 'Inc/100k hab', font: { size: 11 } },
                },
            },
        },
    });
}

// ===== Climate Chart (Temp + Humidity) =====
export function renderClimateChart(datasetsMap) {
    climateChart = destroyChart(climateChart);
    const canvas = document.getElementById('climate-chart');
    if (!datasetsMap || datasetsMap.size === 0) return;

    // Use first dataset only for climate
    const firstEntry = datasetsMap.entries().next().value;
    if (!firstEntry) return;

    const [locationName, data] = firstEntry;
    if (data.length === 0) return;

    const labels = data.map(d => formatSEShort(d.SE));

    const ctx = canvas.getContext('2d');
    climateChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Temp. Média (°C)',
                    data: data.map(d => d.tempmed || null),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2,
                    borderWidth: 2,
                    yAxisID: 'y',
                    spanGaps: true,
                },
                {
                    label: 'Umidade Média (%)',
                    data: data.map(d => d.umidmed || null),
                    borderColor: '#38bdf8',
                    backgroundColor: 'transparent',
                    tension: 0.35,
                    pointRadius: 2,
                    borderWidth: 2,
                    yAxisID: 'y1',
                    spanGaps: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top', labels: { boxWidth: 8, font: { size: 10 } } },
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
                y: {
                    position: 'left',
                    grid: { color: 'rgba(148, 163, 184, 0.08)' },
                    title: { display: true, text: '°C', font: { size: 10 } },
                },
                y1: {
                    position: 'right',
                    grid: { display: false },
                    title: { display: true, text: '%', font: { size: 10 } },
                },
            },
        },
    });
}

// ===== Render All Tracker Charts =====
export function renderAllCharts(datasetsMap, disease = 'dengue', showRtLine = true) {
    renderMainChart(datasetsMap, disease);
    renderRtChart(datasetsMap, showRtLine);
    renderIncidenceChart(datasetsMap);
    renderClimateChart(datasetsMap);
}

// ===== Sanitation Correlation Chart (for info/special view) =====
export function renderSanitationCorrelation(containerId, capitalData) {
    const existing = Chart.getChart(containerId);
    if (existing) existing.destroy();

    const canvas = document.getElementById(containerId);
    if (!canvas || !capitalData || capitalData.length === 0) return;

    const sanitationData = getSanitationData();

    // Build scatter data: X = sewage coverage %, Y = incidence
    const scatterData = capitalData
        .filter(c => c.latest && sanitationData[c.uf])
        .map(c => ({
            x: sanitationData[c.uf].coletaEsgoto,
            y: c.latest.p_inc100k || 0,
            label: c.name,
            uf: c.uf,
        }));

    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Capital (Coleta Esgoto % vs Incidência)',
                data: scatterData,
                backgroundColor: '#38bdf880',
                borderColor: '#38bdf8',
                borderWidth: 1.5,
                pointRadius: 6,
                pointHoverRadius: 9,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const d = ctx.raw;
                            return `${d.label} (${d.uf}): Esgoto ${d.x}%, Inc ${d.y.toFixed(1)}/100k`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: 'Coleta de Esgoto (%)', font: { size: 12 } },
                    grid: { color: 'rgba(148, 163, 184, 0.08)' },
                },
                y: {
                    title: { display: true, text: 'Incidência por 100k hab.', font: { size: 12 } },
                    grid: { color: 'rgba(148, 163, 184, 0.08)' },
                },
            },
        },
    });
}
