let currentRange = 'day';
let selectedDate = null;
let overviewChartInstance = null;
let analyticsChartInstance = null;

// Modern visually balanced color palette for dynamic charts
const colorPalette = [
    { bg: 'rgba(99, 102, 241, 0.85)', border: '#4f46e5' },  // Indigo (Relay)
    { bg: 'rgba(16, 185, 129, 0.85)', border: '#059669' },  // Emerald (GasSensor)
    { bg: 'rgba(245, 158, 11, 0.85)', border: '#d97706' },  // Amber (Ultrasonic)
    { bg: 'rgba(236, 72, 153, 0.85)', border: '#db2777' },  // Pink
    { bg: 'rgba(6, 182, 212, 0.85)', border: '#0891b2' },   // Cyan
    { bg: 'rgba(168, 85, 247, 0.85)', border: '#9333ea' },  // Purple
    { bg: 'rgba(239, 68, 68, 0.85)', border: '#dc2626' }    // Red
];

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
    setInterval(fetchDashboardData, 5000); // Realtime Auto Sync
});

// Mobile Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
}

// Navigation Tabs Switcher
function switchTab(tabName) {
    const tabs = ['overview', 'analytics', 'misclassification', 'logs'];
    tabs.forEach(t => {
        const sec = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`nav-${t}`);
        if (t === tabName) {
            sec.classList.remove('hidden');
            btn.classList.add('active');
            btn.classList.remove('text-slate-500');
        } else {
            sec.classList.add('hidden');
            btn.classList.remove('active');
            btn.classList.add('text-slate-500');
        }
    });

    const pageTitles = {
        overview: 'Dashboard <span class="text-xs font-normal text-slate-400">Control Panel</span>',
        analytics: 'Analytics <span class="text-xs font-normal text-slate-400">Graphical Reports</span>',
        misclassification: 'Misclassifications <span class="text-xs font-normal text-slate-400">Model Accuracy Analysis</span>',
        logs: 'Telemetry Logs <span class="text-xs font-normal text-slate-400">Database History</span>'
    };
    document.getElementById('page-title').innerHTML = pageTitles[tabName];
}

// Filter Preset Buttons Handler
function setFilter(range) {
    currentRange = range;
    selectedDate = null; 
    document.getElementById('specific-date').value = ''; // Reset specific date picker

    ['day', 'week', 'month'].forEach(r => {
        const btn = document.getElementById(`btn-${r}`);
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

// Specific Date Picker Change Handler
function onDateSearch() {
    const dateVal = document.getElementById('specific-date').value;
    if (!dateVal) return;

    selectedDate = dateVal;
    currentRange = 'custom';

    // Remove active styles from preset buttons
    ['day', 'week', 'month'].forEach(r => {
        const btn = document.getElementById(`btn-${r}`);
        btn.classList.remove('active');
        btn.classList.add('text-slate-500');
    });

    fetchDashboardData();
}

async function fetchDashboardData() {
    try {
        let url = `/api/dashboard/summary?range=${currentRange}`;
        if (selectedDate) {
            url += `&date=${selectedDate}`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (data.status === 'success') {
            updateOverviewStats(data.summary);
            updateLatestCapture(data.summary.latestRecord);
            updateCharts(data.summary.classCounts);
            updateMisclassificationsTable(data.summary.misclassifications);
            updateLogsTable(data.summary.records);
        }
    } catch (err) {
        console.error('Data loading error:', err);
    }
}

function updateOverviewStats(summary) {
    document.getElementById('stat-total').innerText = summary.totalObjects;
    document.getElementById('stat-confidence').innerText = `${summary.avgConfidence}%`;
    document.getElementById('stat-misclass').innerText = summary.misclassCount;
    document.getElementById('stat-classes').innerText = Object.keys(summary.classCounts).length;
    document.getElementById('badge-misclass').innerText = summary.misclassCount;
}

function updateLatestCapture(record) {
    if (!record) return;

    const imgEl = document.getElementById('latest-image');
    const placeholder = document.getElementById('image-placeholder');

    if (record.group_data.image && record.group_data.image.url) {
        imgEl.src = record.group_data.image.url;
        imgEl.classList.remove('hidden');
        placeholder.classList.add('hidden');
    }

    document.getElementById('latest-class').innerText = record.group_data.strings.class;
    document.getElementById('latest-confidence').innerText = `${record.group_data.strings.confidence}%`;
    document.getElementById('latest-time').innerText = `${record.timestamp.date} (${record.timestamp.time})`;
}

function updateCharts(classCounts) {
    const labels = Object.keys(classCounts);
    const dataValues = Object.values(classCounts);

    // Dynamic Multi-color setup per Item
    const backgroundColors = labels.map((_, index) => colorPalette[index % colorPalette.length].bg);
    const borderColors = labels.map((_, index) => colorPalette[index % colorPalette.length].border);

    // 1. Overview Bar Chart with Multi-colors
    const ctx1 = document.getElementById('overviewChart').getContext('2d');
    if (overviewChartInstance) overviewChartInstance.destroy();

    overviewChartInstance = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Item Count',
                data: dataValues,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
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
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 10,
                    cornerRadius: 8,
                    titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Plus Jakarta Sans', size: 12 }
                }
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

    // 2. Detailed Analytics Chart with Multi-colors
    const ctx2 = document.getElementById('detailedAnalyticsChart').getContext('2d');
    if (analyticsChartInstance) analyticsChartInstance.destroy();

    analyticsChartInstance = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Class Count',
                data: dataValues,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 2,
                borderRadius: 12,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    cornerRadius: 8
                }
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

function updateMisclassificationsTable(records) {
    const tbody = document.getElementById('misclass-table-body');
    tbody.innerHTML = '';

    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No misclassification records found. Excellent accuracy!</td></tr>`;
        return;
    }

    records.forEach(r => {
        const tr = document.createElement('tr');
        const imgTag = r.group_data.image && r.group_data.image.url
            ? `<a href="${r.group_data.image.url}" target="_blank"><img src="${r.group_data.image.url}" class="w-9 h-9 object-cover rounded-lg border border-slate-200"></a>`
            : `<span class="text-slate-400">No Image</span>`;

        tr.innerHTML = `
            <td class="p-3">${imgTag}</td>
            <td class="p-3 font-bold text-amber-600">${r.group_data.strings.class}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">${r.group_data.strings.confidence}%</span></td>
            <td class="p-3 text-slate-500">${r.timestamp.date}</td>
            <td class="p-3 text-slate-500">${r.timestamp.time}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateLogsTable(records) {
    const tbody = document.getElementById('logs-table-body');
    tbody.innerHTML = '';

    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No logs found for this timeframe.</td></tr>`;
        return;
    }

    records.slice(0, 15).forEach(r => {
        const tr = document.createElement('tr');
        const imgTag = r.group_data.image && r.group_data.image.url
            ? `<a href="${r.group_data.image.url}" target="_blank"><img src="${r.group_data.image.url}" class="w-9 h-9 object-cover rounded-lg border border-slate-200"></a>`
            : `<span class="text-slate-400">No Image</span>`;

        tr.innerHTML = `
            <td class="p-3">${imgTag}</td>
            <td class="p-3 font-bold text-indigo-600">${r.group_data.strings.class}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">${r.group_data.strings.confidence}%</span></td>
            <td class="p-3 text-slate-500">${r.timestamp.date}</td>
            <td class="p-3 text-slate-500">${r.timestamp.time}</td>
        `;
        tbody.appendChild(tr);
    });
}
