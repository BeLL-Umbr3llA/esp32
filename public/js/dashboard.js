/**
 * TinyML Dashboard Frontend Controller
 * - Handles real-time API polling, tab switching, and Chart.js visualizations.
 */

// State Management
let currentRange = 'day';
let selectedDate = null;
let overviewChartInstance = null;
let analyticsChartInstance = null;
let accuracyChartInstance = null; // 🆕 Accuracy Line Chart Instance အသစ်

// 🆕 Misclassifications နှင့် Correct Cache အတွက် Global Variables တွေ ထည့်သွင်းခြင်း
let allMisclassificationsCache = []; 
let availableClassesCache = [];
let allCorrectCache = []; // 🆕 Correct Data Cache အတွက် အသစ်ထည့်သွင်းခြင်း

// Node.js Backend Server URL
const API_BASE_URL = 'http://localhost:3000';

// Color Palette
const colorPalette = [
    { bg: 'rgba(99, 102, 241, 0.85)', border: '#4f46e5' },  // Indigo
    { bg: 'rgba(16, 185, 129, 0.85)', border: '#059669' },  // Emerald
    { bg: 'rgba(245, 158, 11, 0.85)', border: '#d97706' },  // Amber
    { bg: 'rgba(236, 72, 153, 0.85)', border: '#db2777' },  // Pink
    { bg: 'rgba(6, 182, 212, 0.85)', border: '#0891b2' },   // Cyan
    { bg: 'rgba(168, 85, 247, 0.85)', border: '#9333ea' },  // Purple
    { bg: 'rgba(239, 68, 68, 0.85)', border: '#dc2626' }    // Red
];

const colorPalettePie = [
    { bg: '#8ca9d3', border: '#7290bd' }, 
    { bg: '#a7d18c', border: '#8fb675' }, 
    { bg: '#f4e06d', border: '#dec853' }, 
    { bg: '#f5c211', border: '#dcaa02' }, 
    { bg: '#ca9200', border: '#ad7c00' }, 
    { bg: '#c2c2c2', border: '#a8a8a8' }  
];

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
    setInterval(fetchDashboardData, 5000); 
});

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('-translate-x-full');
    if (overlay) overlay.classList.toggle('hidden');
}



function switchTab(tabId) {
    // Tab အားလုံးကို ဖုံးထားရန် (hidden class ထည့်ရန်)
    const tabs = ['overview', 'analytics', 'misclassification', 'correct', 'logs'];
    tabs.forEach(t => {
        const section = document.getElementById(`tab-${t}`);
        const navBtn = document.getElementById(`nav-${t}`);
        
        if (section) {
            section.classList.add('hidden');
        }
        if (navBtn) {
            navBtn.classList.remove('active', 'bg-slate-100', 'text-slate-800');
            navBtn.classList.add('text-slate-500', 'hover:bg-slate-50');
        }
    });

    // ရွေးချယ်ထားသော Tab ကို ပေါ်လာစေရန် (hidden class ဖြုတ်ရန်)
    const activeSection = document.getElementById(`tab-${tabId}`);
    const activeNavBtn = document.getElementById(`nav-${tabId}`);

    if (activeSection) {
        activeSection.classList.remove('hidden');
    }
    if (activeNavBtn) {
        activeNavBtn.classList.remove('text-slate-500', 'hover:bg-slate-50');
        activeNavBtn.classList.add('active', 'bg-slate-100', 'text-slate-800');
    }

    // Page title ကို လိုအပ်သလို ပြောင်းချင်ရင်
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        if (tabId === 'misclassification') {
            pageTitle.innerHTML = `Misclassifications <span class="text-xs font-normal text-slate-400">Model Accuracy Analysis</span>`;
        } else if (tabId === 'correct') {
            pageTitle.innerHTML = `Correct Data <span class="text-xs font-normal text-slate-400">Verified Classifications</span>`;
        } else if (tabId === 'analytics') {
            pageTitle.innerHTML = `Analytics & Graphs <span class="text-xs font-normal text-slate-400">Performance Metrics</span>`;
        } else if (tabId === 'logs') {
            pageTitle.innerHTML = `Data Table Logs <span class="text-xs font-normal text-slate-400">Full Telemetry</span>`;
        } else {
            pageTitle.innerHTML = `TinyML-Powered Robotic Sorting System Dashboard <span class="text-xs font-normal text-slate-400">Live</span>`;
        }
    }
}


function setFilter(range) {
    currentRange = range;
    selectedDate = null; 
    const dateInput = document.getElementById('specific-date');
    if (dateInput) dateInput.value = ''; 

    ['day', 'week', 'month'].forEach(r => {
        const btn = document.getElementById(`btn-${r}`);
        if (!btn) return;
        if (r === range) {
            btn.classList.add('active');
            btn.classList.remove('text-slate-500');
        } else {
            btn.classList.remove('active');
            btn.classList.add('text-slate-500');
        }
    });
    fetchDashboardData();
}

function onDateSearch() {
    const dateVal = document.getElementById('specific-date')?.value;
    if (!dateVal) return;

    selectedDate = dateVal;
    currentRange = 'custom';

    ['day', 'week', 'month'].forEach(r => {
        const btn = document.getElementById(`btn-${r}`);
        if (btn) {
            btn.classList.remove('active');
            btn.classList.add('text-slate-500');
        }
    });

    fetchDashboardData();
}

async function fetchDashboardData() {
    try {
        const baseUrl = window.location.port === '5500' ? API_BASE_URL : '';
        let url = `${baseUrl}/api/dashboard/summary?range=${currentRange}`;
        
        if (selectedDate) {
            url += `&date=${selectedDate}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const data = await res.json();

        if (data.status === 'success' && data.summary) {
            updateOverviewStats(data.summary);
            updateLatestCapture(data.summary.latestRecord);
            updateCharts(data.summary.classCounts || {});
            updateAccuracyTrendChart(data.summary.records || []); 
          
            // Misclassifications များကို class "unknown" ဖြစ်တာတွေချည်း သီးသန့်စစ်ထုတ်ခြင်း
            const rawMisclass = data.summary.misclassifications || data.summary.records || [];
            allMisclassificationsCache = rawMisclass.filter(r => {
                const cls = r.group_data?.strings?.class;
                return cls && cls.toLowerCase() === 'unknown';
            });
            
            populateMisclassDropdowns(allMisclassificationsCache);
            filterMisclassifications(); 

            // 🛠️ Correct Records များကို Backend မှမပါလာလျှင် records ထဲမှ unknown မဟုတ်သည်များကို အလိုအလျောက်စစ်ထုတ်ပေးမည်
            const rawRecords = data.summary.records || [];
            allCorrectCache = data.summary.correctRecords || rawRecords.filter(r => {
                const cls = (r.group_data?.strings?.class || r.predicted || '').toLowerCase();
                return cls && cls !== 'unknown';
            });

            populateCorrectDropdowns(allCorrectCache);
            filterCorrect();

            updateLogsTable(data.summary.records || []);
        }
    } catch (err) {
        console.error('Data loading error:', err);
    }
}

function updateOverviewStats(summary) {
    setText('stat-total', summary.totalObjects ?? 0);
    setText('stat-confidence', `${summary.avgConfidence ?? 0}%`);
    setText('stat-misclass', summary.misclassCount ?? 0);
    setText('stat-classes', summary.classCounts ? Object.keys(summary.classCounts).length : 0);
    setText('badge-misclass', summary.misclassCount ?? 0);

    // 🆕 Correct Data အရေအတွက်ကို Sidebar Badge ထဲသို့ ထည့်သွင်းပေးခြင်း
    const correctCount = allCorrectCache.length;
    setText('badge-correct', correctCount);
}

function setText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.innerText = text;
}

function updateLatestCapture(record) {
    if (!record) return;

    const imgEl = document.getElementById('latest-image');
    const placeholder = document.getElementById('image-placeholder');

    if (record.group_data?.image?.url) {
        if (imgEl) {
            imgEl.src = record.group_data.image.url;
            imgEl.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
    }

    if (record.group_data?.strings) {
        setText('latest-class', record.group_data.strings.class || 'Unknown');
        setText('latest-confidence', `${record.group_data.strings.confidence || 0}%`);
    }
    
    if (record.timestamp) {
        setText('latest-time', `${record.timestamp.date || ''} (${record.timestamp.time || ''})`);
    }
}

function updateCharts(classCounts) {
    const labels = Object.keys(classCounts);
    const dataValues = Object.values(classCounts);
    const totalCount = dataValues.reduce((a, b) => a + b, 0);

    const barBackgroundColors = labels.map((_, index) => colorPalette[index % colorPalette.length].bg);
    const barBorderColors = labels.map((_, index) => colorPalette[index % colorPalette.length].border);

    const pieBackgroundColors = labels.map((_, index) => colorPalettePie[index % colorPalettePie.length].bg);
    const pieBorderColors = labels.map((_, index) => colorPalettePie[index % colorPalettePie.length].border);

    if (typeof ChartDataLabels !== 'undefined' && Chart.registry && !Chart.registry.plugins.get('datalabels')) {
        Chart.register(ChartDataLabels);
    }

    // 1. Overview Section - Pie Chart
    const ctx1 = document.getElementById('overviewChart');
    if (ctx1) {
        if (overviewChartInstance) overviewChartInstance.destroy();

        overviewChartInstance = new Chart(ctx1.getContext('2d'), {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: pieBackgroundColors,
                    borderColor: pieBorderColors,
                    borderWidth: 1,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 14,
                            font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
                            color: '#334155'
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                const val = context.raw || 0;
                                const pct = totalCount > 0 ? ((val / totalCount) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ${val} (${pct}%)`;
                            }
                        }
                    },
                    datalabels: {
                        color: '#1e293b',
                        font: { family: 'Plus Jakarta Sans', weight: 'bold', size: 13 },
                        formatter: (value) => {
                            if (totalCount === 0) return '0%';
                            const percentage = ((value / totalCount) * 100).toFixed(0);
                            return percentage > 2 ? `${percentage}%` : '';
                        }
                    }
                }
            }
        });
    }

    // 2. Detailed Analytics Tab Section - Bar Chart
    const ctx2 = document.getElementById('detailedAnalyticsChart');
    if (ctx2) {
        if (analyticsChartInstance) analyticsChartInstance.destroy();

        analyticsChartInstance = new Chart(ctx2.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Class Count',
                    data: dataValues,
                    backgroundColor: barBackgroundColors,
                    borderColor: barBorderColors,
                    borderWidth: 2,
                    borderRadius: 10,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    datalabels: { display: false }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: { precision: 0, font: { family: 'Plus Jakarta Sans' } },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        ticks: { font: { family: 'Plus Jakarta Sans', weight: '600' } },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

// 🆕 Accuracy Performance Time-Series Line Chart Function
function updateAccuracyTrendChart(records) {
    const ctx = document.getElementById('accuracyTrendChart');
    if (!ctx) return;

    if (accuracyChartInstance) accuracyChartInstance.destroy();
    if (!records || records.length === 0) return;

    const sortedRecords = [...records].sort((a, b) => {
        const timeA = new Date(`${a.timestamp?.date || ''} ${a.timestamp?.time || ''}`).getTime();
        const timeB = new Date(`${b.timestamp?.date || ''} ${b.timestamp?.time || ''}`).getTime();
        return timeA - timeB;
    });

    const timeLabels = sortedRecords.map(r => `${r.timestamp?.date || ''} ${r.timestamp?.time || ''}`);
    const classes = [...new Set(sortedRecords.map(r => r.group_data?.strings?.class).filter(Boolean))];

    const datasets = classes.map((cls, index) => {
        const color = colorPalette[index % colorPalette.length];
        const data = sortedRecords.map(r => {
            if (r.group_data?.strings?.class === cls) {
                return parseFloat(r.group_data.strings.confidence) || 0;
            }
            return null;
        });

        return {
            label: cls,
            data: data,
            borderColor: color.border,
            backgroundColor: color.bg,
            tension: 0.3,
            fill: false,
            spanGaps: true, 
            borderWidth: 2.5,
            pointRadius: 0, 
            pointHoverRadius: 5
        };
    });

    accuracyChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 15, bottom: 15, left: 10, right: 10 }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 16,
                        font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
                        color: '#334155'
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        title: function(context) {
                            return `Time: ${context[0].label}`;
                        },
                        label: function(context) {
                            const val = context.raw;
                            if (val === null) return null;
                            return ` ${context.dataset.label} Accuracy: ${val}%`;
                        }
                    }
                },
                datalabels: { display: false }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        callback: function(value) { return value + '%'; },
                        font: { family: 'Plus Jakarta Sans' },
                        color: '#64748b',
                        padding: 8
                    },
                    grid: { color: '#f1f5f9' },
                    title: {
                        display: true,
                        text: 'Accuracy / Confidence (%)',
                        font: { family: 'Plus Jakarta Sans', weight: '600', size: 12 },
                        color: '#475569'
                    }
                },
                x: {
                    ticks: {
                        font: { family: 'Plus Jakarta Sans', size: 11 },
                        color: '#64748b',
                        maxTicksLimit: 8,
                        maxRotation: 0,
                        minRotation: 0
                    },
                    grid: { display: false },
                    title: {
                        display: true,
                        text: 'Time Series',
                        font: { family: 'Plus Jakarta Sans', weight: '600', size: 12 },
                        color: '#475569'
                    }
                }
            }
        }
    });
}

// Dropdown ထဲသို့ Class အမည်များ ထည့်သွင်းပေးခြင်း
function populateMisclassDropdowns(misclassifications) {
    const selectEl = document.getElementById('filter-misclass-class');
    if (!selectEl) return;

    const currentValue = selectEl.value;
    const classes = [...new Set(misclassifications.map(r => r.group_data?.strings?.class).filter(Boolean))];
    availableClassesCache = classes;

    selectEl.innerHTML = '<option value="all">All Classes</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = cls;
        selectEl.appendChild(opt);
    });

    if (currentValue && (currentValue === 'all' || classes.includes(currentValue))) {
        selectEl.value = currentValue;
    }
}

// 🆕 Filter လုပ်ဆောင်ပေးမည့် ပင်မ Function
function filterMisclassifications() {
    const selectedClass = document.getElementById('filter-misclass-class')?.value || 'all';
    const selectedDate = document.getElementById('filter-misclass-date')?.value || '';

    let filtered = [...allMisclassificationsCache];

    // Class အလိုက်စစ်ထုတ်ခြင်း
    if (selectedClass !== 'all') {
        filtered = filtered.filter(r => r.group_data?.strings?.class === selectedClass);
    }

    // 🆕 Date အလိုက်စစ်ထုတ်ခြင်း
    if (selectedDate) {
        filtered = filtered.filter(r => r.timestamp?.date === selectedDate);
    }

    renderMisclassificationsTable(filtered);
}

// Table ထဲသို့ Data ထည့်သွင်းပေးသည့် Helper Function
function renderMisclassificationsTable(misclassifications) {
    const tbody = document.getElementById('misclass-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (!misclassifications || misclassifications.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No matching misclassifications found.</td></tr>`;
        return;
    }

    misclassifications.forEach(r => {
        const tr = document.createElement('tr');
        const imgUrl = r.group_data?.image?.url;
        const imgTag = imgUrl
            ? `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" class="w-9 h-9 object-cover rounded-lg border border-slate-200"></a>`
            : `<span class="text-slate-400">No Image</span>`;

        tr.innerHTML = `
            <td class="p-3">${imgTag}</td>
            <td class="p-3 font-bold text-amber-600">${r.group_data?.strings?.class || 'Unknown'}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">${r.group_data?.strings?.confidence || 0}%</span></td>
            <td class="p-3 text-slate-500">${r.timestamp?.date || ''}</td>
            <td class="p-3 text-slate-500">${r.timestamp?.time || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 🆕 Filter များကို ရှင်းလင်းပေးခြင်း (Reset)
function resetMisclassFilters() {
    const classSelect = document.getElementById('filter-misclass-class');
    const dateInput = document.getElementById('filter-misclass-date');

    if (classSelect) classSelect.value = 'all';
    if (dateInput) dateInput.value = '';

    filterMisclassifications();
}

// 🆕 Dropdown ထဲသို့ Correct Class အမည်များ ထည့်သွင်းပေးခြင်း
function populateCorrectDropdowns(correctRecords) {
    const selectEl = document.getElementById('filter-correct-class');
    if (!selectEl) return;

    const currentValue = selectEl.value;
    
    // 🆕 Dropdown ထဲတွင် unknown များကို ဖယ်ထုတ်ရန်
    const validRecords = correctRecords.filter(r => {
        const cls = (r.group_data?.strings?.class || r.predicted || '').toLowerCase();
        return cls && cls !== 'unknown';
    });

    const classes = [...new Set(validRecords.map(r => r.group_data?.strings?.class || r.predicted).filter(Boolean))];

    selectEl.innerHTML = '<option value="all">All Classes</option>';
    classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = cls;
        selectEl.appendChild(opt);
    });

    if (currentValue && (currentValue === 'all' || classes.includes(currentValue))) {
        selectEl.value = currentValue;
    }
}

function filterCorrect() {
    const selectedClass = document.getElementById('filter-correct-class')?.value || 'all';
    
    let filtered = [...allCorrectCache]; 

    // 🆕 'unknown' class ပါလာလျှင် ဖယ်ထုတ်ပေးခြင်း (Exclude unknown class)
    filtered = filtered.filter(r => {
        const cls = (r.group_data?.strings?.class || r.predicted || '').toLowerCase();
        return cls && cls !== 'unknown';
    });

    // Class အလိုက် စစ်ထုတ်ခြင်း
    if (selectedClass !== 'all') {
        filtered = filtered.filter(r => r.predicted === selectedClass || r.actual === selectedClass || r.group_data?.strings?.class === selectedClass);
    }

    renderCorrectTable(filtered);
}

// Table ထဲသို့ Correct Data များ ထည့်သွင်းပေးသည့် Helper Function
function renderCorrectTable(correctRecords) {
    const tbody = document.getElementById('correct-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (!correctRecords || correctRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No matching correct records found.</td></tr>`;
        return;
    }

    correctRecords.forEach(r => {
        const tr = document.createElement('tr');
        const imgUrl = r.group_data?.image?.url;
        const imgTag = imgUrl
            ? `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" class="w-9 h-9 object-cover rounded-lg border border-slate-200"></a>`
            : `<span class="text-slate-400">No Image</span>`;

        tr.innerHTML = `
            <td class="p-3">${imgTag}</td>
            <td class="p-3 font-bold text-emerald-600">${r.group_data?.strings?.class || r.predicted || 'Unknown'}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">${r.group_data?.strings?.confidence || 0}%</span></td>
            <td class="p-3 text-slate-500">${r.timestamp?.date || ''}</td>
            <td class="p-3 text-slate-500">${r.timestamp?.time || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

function resetCorrectFilters() {
    const classSelect = document.getElementById('filter-correct-class');
    if (classSelect) classSelect.value = 'all';
    filterCorrect();
}

function updateLogsTable(records) {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No logs found for this timeframe.</td></tr>`;
        return;
    }

    records.slice(0, 15).forEach(r => {
        const tr = document.createElement('tr');
        const imgUrl = r.group_data?.image?.url;
        const imgTag = imgUrl
            ? `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" class="w-9 h-9 object-cover rounded-lg border border-slate-200"></a>`
            : `<span class="text-slate-400">No Image</span>`;

        tr.innerHTML = `
            <td class="p-3">${imgTag}</td>
            <td class="p-3 font-bold text-indigo-600">${r.group_data?.strings?.class || 'Unknown'}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">${r.group_data?.strings?.confidence || 0}%</span></td>
            <td class="p-3 text-slate-500">${r.timestamp?.date || ''}</td>
            <td class="p-3 text-slate-500">${r.timestamp?.time || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

