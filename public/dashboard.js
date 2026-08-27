let currentRange = 'day';
let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
    // Auto Refresh every 5 seconds for Real-time Dashboard Updates
    setInterval(fetchDashboardData, 5000);
});

function setFilter(range) {
    currentRange = range;
    ['day', 'week', 'month'].forEach(r => {
        const btn = document.getElementById(`btn-${r}`);
        if (r === range) {
            btn.className = 'px-4 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white shadow';
        } else {
            btn.className = 'px-4 py-1.5 text-xs font-semibold rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700';
        }
    });
    fetchDashboardData();
}

async function fetchDashboardData() {
    try {
        const res = await fetch(`/api/dashboard/summary?range=${currentRange}`);
        const data = await res.json();

        if (data.status === 'success') {
            updateOverviewStats(data.summary);
            updateLatestCapture(data.summary.latestRecord);
            updateChart(data.summary.classCounts);
            updateTable(data.summary.records);
        }
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
}

function updateOverviewStats(summary) {
    document.getElementById('stat-total').innerText = summary.totalObjects;
    document.getElementById('stat-confidence').innerText = `${summary.avgConfidence}%`;
    document.getElementById('stat-classes').innerText = Object.keys(summary.classCounts).length;
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

function updateChart(classCounts) {
    const ctx = document.getElementById('classChart').getContext('2d');
    const labels = Object.keys(classCounts);
    const dataValues = Object.values(classCounts);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sorted Count',
                data: dataValues,
                backgroundColor: '#10b981',
                borderColor: '#059669',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
                x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function updateTable(records) {
    const tbody = document.getElementById('logs-table-body');
    tbody.innerHTML = '';

    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No logs found for this range.</td></tr>`;
        return;
    }

    records.slice(0, 10).forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/40 transition';

        const imgTag = r.group_data.image && r.group_data.image.url 
            ? `<a href="${r.group_data.image.url}" target="_blank"><img src="${r.group_data.image.url}" class="w-10 h-10 object-cover rounded border border-slate-700"></a>`
            : `<span class="text-slate-600">No Img</span>`;

        tr.innerHTML = `
            <td class="p-3">${imgTag}</td>
            <td class="p-3 font-semibold text-emerald-400">${r.group_data.strings.class}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">${r.group_data.strings.confidence}%</span></td>
            <td class="p-3 text-slate-400">${r.timestamp.date}</td>
            <td class="p-3 text-slate-400">${r.timestamp.time}</td>
        `;
        tbody.appendChild(tr);
    });
}
