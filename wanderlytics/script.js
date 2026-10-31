/**
 * ==========================================================
 * Wanderlytics – Tourism Intelligence Dashboard
 * script.js — Main application logic (Vanilla JS)
 * ==========================================================
 *
 * Architecture:
 *  1. State management  – single source of truth
 *  2. Data loader       – fetch data.json, validate, handle errors
 *  3. Filter engine     – populate selects & apply filters
 *  4. KPI updater       – compute & animate KPI values
 *  5. Chart registry    – create / update all 10 charts
 *  6. Event handlers    – sidebar, filters, resize
 * ==========================================================
 */

'use strict';

/* ============================================================
   1. GLOBAL STATE
   ============================================================ */

/** @type {{ raw: Object[], filtered: Object[] }} */
const STATE = {
  raw:      [],   // all records from data.json
  filtered: [],   // records after current filter selection
};

/** Chart.js instance registry — keyed by canvas id */
const CHARTS = {};

/** Chart.js default color palettes */
const PALETTE = {
  teal:   ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1'],
  turq:   ['#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe'],
  navy:   ['#0f2044', '#1e3a5f', '#2d5282', '#3b6ca8', '#4a85cc', '#6499d6'],
  mixed:  ['#0d9488', '#06b6d4', '#0f2044', '#7c3aed', '#f59e0b', '#10b981',
           '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'],
  donut:  ['#0f2044', '#0d9488', '#06b6d4', '#7c3aed', '#f59e0b', '#10b981'],
};

/* ============================================================
   2. DATA LOADER
   ============================================================ */

/**
 * Fetches and validates data.json.
 * Populates STATE.raw and triggers the initial render.
 */
async function loadData() {
  try {
    const response = await fetch('data.json');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    // Validate structure
    if (!json || !Array.isArray(json.bookings)) {
      throw new Error('Format data tidak valid: properti "bookings" tidak ditemukan atau bukan array.');
    }

    if (json.bookings.length === 0) {
      throw new Error('Data kosong: tidak ada record booking di dalam file JSON.');
    }

    STATE.raw = json.bookings;
    STATE.filtered = [...STATE.raw];

    // Initialise dashboard
    initFilters();
    updateDashboard();
    showDashboard();

  } catch (err) {
    showError(err.message);
  }
}

/* ============================================================
   3. UI STATE HELPERS
   ============================================================ */

function showDashboard() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('dashboardContent').classList.remove('hidden');

  // Update status indicator
  const dot   = document.querySelector('#dataStatus .status-dot');
  const label = document.querySelector('#dataStatus .status-label');
  dot.className   = 'status-dot w-2 h-2 rounded-full inline-block status-dot-success';
  label.textContent = `${STATE.raw.length} records`;

  // Last updated badge
  const badge = document.getElementById('lastUpdated');
  badge.textContent = `Data 2024 · ${STATE.raw.length} bookings`;
}

function showError(message) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('errorState').classList.add('flex');
  document.getElementById('errorMessage').textContent = message || 'Terjadi kesalahan tak dikenal.';

  const dot   = document.querySelector('#dataStatus .status-dot');
  const label = document.querySelector('#dataStatus .status-label');
  dot.className   = 'status-dot w-2 h-2 rounded-full inline-block status-dot-error';
  label.textContent = 'Error';
}

/* ============================================================
   4. FILTER ENGINE
   ============================================================ */

/**
 * Extracts unique values for a given field and populates a <select>.
 * @param {string} field     – booking object key
 * @param {string} selectId  – DOM id of the <select>
 */
function populateSelect(field, selectId) {
  const select = document.getElementById(selectId);
  const values = [...new Set(STATE.raw.map(b => b[field]).filter(Boolean))].sort();

  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

/** Populate all 4 filter dropdowns from raw data */
function initFilters() {
  populateSelect('region',       'filterRegion');
  populateSelect('category',     'filterCategory');
  populateSelect('visitorType',  'filterVisitorType');
  populateSelect('bookingChannel', 'filterChannel');

  // Event listeners — update on change
  ['filterRegion', 'filterCategory', 'filterVisitorType', 'filterChannel']
    .forEach(id => document.getElementById(id).addEventListener('change', applyFilters));

  // Reset button
  document.getElementById('resetFilters').addEventListener('click', resetFilters);
}

/** Read current filter values and apply them to STATE.filtered */
function applyFilters() {
  const region   = document.getElementById('filterRegion').value;
  const category = document.getElementById('filterCategory').value;
  const type     = document.getElementById('filterVisitorType').value;
  const channel  = document.getElementById('filterChannel').value;

  STATE.filtered = STATE.raw.filter(b => {
    if (region   !== 'all' && b.region          !== region)   return false;
    if (category !== 'all' && b.category        !== category) return false;
    if (type     !== 'all' && b.visitorType     !== type)     return false;
    if (channel  !== 'all' && b.bookingChannel  !== channel)  return false;
    return true;
  });

  updateDashboard();
}

/** Reset all filters to "all" and re-render */
function resetFilters() {
  ['filterRegion', 'filterCategory', 'filterVisitorType', 'filterChannel']
    .forEach(id => { document.getElementById(id).value = 'all'; });

  STATE.filtered = [...STATE.raw];
  updateDashboard();
}

/* ============================================================
   5. KPI UPDATER
   ============================================================ */

/**
 * Format a number as abbreviated Indonesian currency (Rp X,XX M / B)
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  if (value >= 1e9)  return `Rp ${(value / 1e9).toFixed(2)} M`;   // Milyar
  if (value >= 1e6)  return `Rp ${(value / 1e6).toFixed(2)} Jt`;  // Juta
  return `Rp ${value.toLocaleString('id-ID')}`;
}

/**
 * Animate a number counter on an element
 * @param {HTMLElement} el
 * @param {string} target – formatted final string
 */
function setKPI(el, target) {
  // Simple swap with a brief CSS class to trigger transition
  el.style.opacity = '0';
  el.style.transform = 'translateY(6px)';
  setTimeout(() => {
    el.textContent = target;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  }, 150);
}

/** Compute KPIs from STATE.filtered and update DOM */
function updateKPIs() {
  const data = STATE.filtered;

  const totalVisitors  = data.reduce((s, b) => s + (b.visitors || 0), 0);
  const totalRevenue   = data.reduce((s, b) => s + (b.revenue  || 0), 0);
  const totalBookings  = data.length;
  const avgStay        = data.length > 0
    ? (data.reduce((s, b) => s + (b.lengthOfStay || 0), 0) / data.length).toFixed(1)
    : 0;

  setKPI(document.getElementById('kpiVisitors'), totalVisitors.toLocaleString('id-ID'));
  setKPI(document.getElementById('kpiRevenue'),  formatCurrency(totalRevenue));
  setKPI(document.getElementById('kpiBookings'), totalBookings.toLocaleString('id-ID'));
  setKPI(document.getElementById('kpiAvgStay'),  `${avgStay} hari`);
}

/* ============================================================
   6. CHART UTILITIES
   ============================================================ */

/**
 * Group records by a field key, returning { label: aggregatedValue }
 * @param {Object[]} data
 * @param {string}   groupKey  – field to group by
 * @param {string}   valueKey  – field to sum (default: count records)
 * @returns {Object}
 */
function groupBy(data, groupKey, valueKey = null) {
  return data.reduce((acc, item) => {
    const key = item[groupKey] || 'Unknown';
    if (!acc[key]) acc[key] = 0;
    acc[key] += valueKey ? (item[valueKey] || 0) : 1;
    return acc;
  }, {});
}

/**
 * Sort an object by values descending, return [labels[], values[]]
 */
function sortedEntries(obj, limit = null) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const sliced  = limit ? entries.slice(0, limit) : entries;
  return {
    labels: sliced.map(e => e[0]),
    values: sliced.map(e => e[1]),
  };
}

/**
 * Global Chart.js defaults for the dashboard theme
 */
function applyChartDefaults() {
  Chart.defaults.font.family = 'Inter, sans-serif';
  Chart.defaults.font.size   = 12;
  Chart.defaults.color       = '#6b7280';
  Chart.defaults.plugins.legend.position = 'bottom';
  Chart.defaults.plugins.legend.labels.boxWidth  = 12;
  Chart.defaults.plugins.legend.labels.padding   = 16;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15,32,68,0.88)';
  Chart.defaults.plugins.tooltip.titleColor      = '#fff';
  Chart.defaults.plugins.tooltip.bodyColor       = 'rgba(255,255,255,.8)';
  Chart.defaults.plugins.tooltip.padding         = 10;
  Chart.defaults.plugins.tooltip.cornerRadius    = 8;
}

/**
 * Create or update a Chart.js chart.
 * If chart exists, update its data; otherwise create new.
 * @param {string}  canvasId
 * @param {string}  type
 * @param {Object}  data
 * @param {Object}  options
 */
function upsertChart(canvasId, type, data, options = {}) {
  if (CHARTS[canvasId]) {
    CHARTS[canvasId].data    = data;
    CHARTS[canvasId].options = options;
    CHARTS[canvasId].update('active');
    return;
  }

  const ctx = document.getElementById(canvasId).getContext('2d');
  CHARTS[canvasId] = new Chart(ctx, { type, data, options });
}

/* ============================================================
   7. CHART RENDERERS
   ============================================================ */

/* ----- 7.1  Visitor Trend (Line) ----------------------------- */
function renderVisitorTrend() {
  const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];

  // Group by month number
  const monthly = Array(12).fill(0);
  STATE.filtered.forEach(b => {
    const m = new Date(b.date).getMonth(); // 0-indexed
    if (!isNaN(m)) monthly[m] += (b.visitors || 0);
  });

  upsertChart('chartVisitorTrend', 'line', {
    labels: MONTHS,
    datasets: [{
      label: 'Visitors',
      data: monthly,
      borderColor: PALETTE.teal[0],
      backgroundColor: 'rgba(13,148,136,.12)',
      borderWidth: 2.5,
      pointBackgroundColor: PALETTE.teal[0],
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 5,
      tension: 0.4,
      fill: true,
    }],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(0,0,0,.04)' } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,.05)' },
        ticks: { precision: 0 },
      },
    },
  });
}

/* ----- 7.2  Revenue per Region (Bar) ------------------------- */
function renderRevenueRegion() {
  const grouped  = groupBy(STATE.filtered, 'region', 'revenue');
  const { labels, values } = sortedEntries(grouped);

  upsertChart('chartRevenueRegion', 'bar', {
    labels,
    datasets: [{
      label: 'Revenue (Rp)',
      data: values,
      backgroundColor: labels.map((_, i) => PALETTE.mixed[i % PALETTE.mixed.length]),
      borderRadius: 7,
      borderSkipped: false,
    }],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: {
          callback: v => `${(v/1e6).toFixed(0)}Jt`,
        },
      },
    },
  });
}

/* ----- 7.3  Revenue per Destination Category (Horizontal Bar) */
function renderRevenueCat() {
  const grouped  = groupBy(STATE.filtered, 'category', 'revenue');
  const { labels, values } = sortedEntries(grouped);

  upsertChart('chartRevenueCat', 'bar', {
    labels,
    datasets: [{
      label: 'Revenue (Rp)',
      data: values,
      backgroundColor: labels.map((_, i) => PALETTE.turq[i % PALETTE.turq.length]),
      borderRadius: 6,
      borderSkipped: false,
    }],
  }, {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { callback: v => `${(v/1e6).toFixed(0)}Jt` },
      },
      y: { grid: { display: false } },
    },
  });
}

/* ----- 7.4  Visitors per Tour Operator (Bar) ----------------- */
function renderVisitorOperator() {
  const grouped  = groupBy(STATE.filtered, 'operator', 'visitors');
  const { labels, values } = sortedEntries(grouped);

  upsertChart('chartVisitorOperator', 'bar', {
    labels,
    datasets: [{
      label: 'Visitors',
      data: values,
      backgroundColor: labels.map((_, i) => PALETTE.navy[i % PALETTE.navy.length]),
      borderRadius: 7,
      borderSkipped: false,
    }],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 25,
          callback: function(val) {
            const lbl = this.getLabelForValue(val);
            return lbl.length > 12 ? lbl.slice(0, 12) + '…' : lbl;
          },
        },
      },
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  });
}

/* ----- 7.5  Visitor Type Distribution (Doughnut) ------------- */
function renderVisitorType() {
  const grouped  = groupBy(STATE.filtered, 'visitorType', 'visitors');
  const { labels, values } = sortedEntries(grouped);

  upsertChart('chartVisitorType', 'doughnut', {
    labels,
    datasets: [{
      data: values,
      backgroundColor: [PALETTE.teal[0], PALETTE.turq[0], PALETTE.navy[3]],
      borderWidth: 2,
      borderColor: '#fff',
      hoverOffset: 6,
    }],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString('id-ID')} visitors`,
        },
      },
    },
  });
}

/* ----- 7.6  Payment Method Usage (Doughnut) ------------------ */
function renderPaymentMethod() {
  const grouped  = groupBy(STATE.filtered, 'paymentMethod');
  const { labels, values } = sortedEntries(grouped);

  upsertChart('chartPayment', 'doughnut', {
    labels,
    datasets: [{
      data: values,
      backgroundColor: PALETTE.donut,
      borderWidth: 2,
      borderColor: '#fff',
      hoverOffset: 6,
    }],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed} bookings`,
        },
      },
    },
  });
}

/* ----- 7.7  Booking Channel Distribution (Doughnut) ---------- */
function renderBookingChannel() {
  const grouped  = groupBy(STATE.filtered, 'bookingChannel');
  const { labels, values } = sortedEntries(grouped);

  upsertChart('chartChannel', 'doughnut', {
    labels,
    datasets: [{
      data: values,
      backgroundColor: [PALETTE.turq[0], PALETTE.teal[0], PALETTE.navy[2], PALETTE.mixed[3]],
      borderWidth: 2,
      borderColor: '#fff',
      hoverOffset: 6,
    }],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed} bookings`,
        },
      },
    },
  });
}

/* ----- 7.8  Discount vs Revenue (Scatter) -------------------- */
function renderScatter() {
  // Build scatter points: x = discount %, y = revenue
  const points = STATE.filtered.map(b => ({
    x: b.discount  || 0,
    y: Math.round((b.revenue || 0) / 1e6 * 100) / 100, // in Juta
  }));

  upsertChart('chartScatter', 'scatter', {
    datasets: [{
      label: 'Booking',
      data: points,
      backgroundColor: 'rgba(13,148,136,.55)',
      borderColor: 'rgba(13,148,136,.8)',
      borderWidth: 1,
      pointRadius: 6,
      pointHoverRadius: 8,
    }],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` Diskon ${ctx.parsed.x}% → Rp ${ctx.parsed.y.toFixed(2)} Jt`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Diskon (%)' },
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,.04)' },
      },
      y: {
        title: { display: true, text: 'Revenue (Juta Rp)' },
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,.04)' },
      },
    },
  });
}

/* ----- 7.9  Top 10 Most Visited Destinations (Horizontal Bar) */
function renderTop10() {
  const grouped  = groupBy(STATE.filtered, 'destination', 'visitors');
  const { labels, values } = sortedEntries(grouped, 10);

  // Reversed for horizontal bar (bottom-to-top reading order looks natural)
  const labelsR = [...labels].reverse();
  const valuesR = [...values].reverse();

  upsertChart('chartTop10', 'bar', {
    labels: labelsR,
    datasets: [{
      label: 'Visitors',
      data: valuesR,
      backgroundColor: labelsR.map((_, i) => {
        const alpha = 0.55 + (i / labelsR.length) * 0.45;
        return `rgba(6,182,212,${alpha.toFixed(2)})`;
      }),
      borderRadius: 6,
      borderSkipped: false,
    }],
  }, {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { precision: 0 },
        grid: { color: 'rgba(0,0,0,.04)' },
      },
      y: { grid: { display: false } },
    },
  });
}

/* ----- 7.10  Visitors per Destination Category (Bar) ---------- */
function renderVisitorCat() {
  const grouped  = groupBy(STATE.filtered, 'category', 'visitors');
  const { labels, values } = sortedEntries(grouped);

  upsertChart('chartVisitorCat', 'bar', {
    labels,
    datasets: [{
      label: 'Visitors',
      data: values,
      backgroundColor: labels.map((_, i) => PALETTE.mixed[i % PALETTE.mixed.length]),
      borderRadius: 8,
      borderSkipped: false,
    }],
  }, {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
        grid: { color: 'rgba(0,0,0,.05)' },
      },
    },
  });
}

/* ============================================================
   8. MASTER UPDATE — called after every filter change
   ============================================================ */
function updateDashboard() {
  updateKPIs();

  renderVisitorTrend();
  renderRevenueRegion();
  renderRevenueCat();
  renderVisitorOperator();
  renderVisitorType();
  renderPaymentMethod();
  renderBookingChannel();
  renderScatter();
  renderTop10();
  renderVisitorCat();
}

/* ============================================================
   9. SIDEBAR / MOBILE NAVIGATION
   ============================================================ */
function initSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const toggle   = document.getElementById('menuToggle');
  const overlay  = document.getElementById('sidebarOverlay');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.remove('hidden');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener('click', closeSidebar);

  // Close on ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });

  // Active nav link highlight (simple hash-based)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      // Close sidebar on mobile after nav click
      if (window.innerWidth < 1024) closeSidebar();
    });
  });
}

/* ============================================================
   10. INITIALISE ON DOM READY
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Apply Chart.js defaults before any chart is created
  applyChartDefaults();

  // Init sidebar interaction
  initSidebar();

  // Retry button
  document.getElementById('retryBtn').addEventListener('click', () => {
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('flex');
    document.getElementById('loadingState').classList.remove('hidden');
    loadData();
  });

  // Load data and render dashboard
  loadData();
});
