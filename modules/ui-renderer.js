
function updateFileInfo(filename) {
    const info = document.getElementById('file-info');
    const drop = document.getElementById('drop-zone');
    drop.classList.add('hidden');
    info.classList.remove('hidden');
    document.getElementById('filename-display').textContent = filename;
}

function renderColumns(columns) {
    console.log('UIRenderer: Rendering columns dropdown for:', columns.length, 'columns');
    const select = document.getElementById('rule-column');
    select.innerHTML = '<option value="">Select Target Column...</option>' +
        columns.map(c => `<option value="${c.name}">${c.name} (${c.type})</option>`).join('');
}

function renderRuleList(rules, onDelete, onEdit) {
    const container = document.getElementById('rule-list-container');
    const badge = document.getElementById('rule-count-badge');

    badge.textContent = `${rules.length} Rule${rules.length !== 1 ? 's' : ''}`;
    container.innerHTML = '';

    if (rules.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-gray-400 opacity-60">
                <i data-lucide="clipboard-list" class="w-10 h-10 mb-2"></i>
                <p class="text-sm italic">No rules defined yet</p>
            </div>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Sort: Aggregates first then row rules
    const sortedRules = [...rules].sort((a, b) => {
        if (a.isAgg !== b.isAgg) return a.isAgg ? -1 : 1;
        return a.column.localeCompare(b.column);
    });

    sortedRules.forEach(rule => {
        const div = document.createElement('div');
        // Premium card style
        div.className = "group relative bg-white border border-gray-100 p-3 rounded-xl flex items-start gap-3 shadow-sm hover:shadow-md hover:border-blue-200 transition-all mb-2 overflow-hidden";

        const indicatorColor = rule.isAgg ? 'bg-orange-500' : 'bg-blue-500';
        const indicator = `<div class="absolute left-0 top-0 bottom-0 w-1 ${indicatorColor}"></div>`;

        const scopeBadge = rule.isAgg
            ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 uppercase tracking-tighter">Agg</span>`
            : `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-tighter">Row</span>`;

        let ruleText = '';
        if (rule.isAgg) {
            const parts = rule.operator.split('_');
            const aggName = parts[0].toUpperCase();
            const opSym = parts[1] === 'gt' ? '>' : (parts[1] === 'lt' ? '<' : rule.operator);

            let targetText = rule.isColumnComparison
                ? `<span class="text-purple-700 font-bold">${(rule.refAggType || 'sum').toUpperCase()}(${rule.value})</span>`
                : `<span class="text-gray-900 font-bold">${rule.value}</span>`;

            ruleText = `
                <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono text-xs font-bold">${aggName}(${rule.column})</span>
                        <span class="text-gray-300 font-medium">${opSym}</span>
                        ${targetText}
                    </div>
                    <div class="flex items-center gap-2">
                        ${rule.groupBy ? `<span class="text-[9px] font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50 px-1 py-0.5 rounded">Group By: ${rule.groupBy}</span>` : ''}
                        ${rule.distinctPerGroup ? `<span class="text-[9px] font-black text-emerald-500 uppercase tracking-tighter bg-emerald-50 px-1 py-0.5 rounded">Distinct Only</span>` : ''}
                    </div>
                </div>`;
        } else {
            const opLabel = rule.operator === 'gt' ? '>' : (rule.operator === 'lt' ? '<' :
                rule.operator === 'gte' ? '>=' : (rule.operator === 'lte' ? '<=' : rule.operator));

            let targetText = rule.isColumnComparison
                ? `<span class="text-purple-700 font-bold">Col: ${rule.value}</span>`
                : `<span class="text-gray-900 font-bold">"${rule.value}"</span>`;

            ruleText = `
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono text-xs font-bold">${rule.column}</span>
                    <span class="text-gray-300 font-medium">${opLabel}</span>
                    ${targetText}
                </div>`;
        }

        div.innerHTML = `
            ${indicator}
            <div class="flex-shrink-0 mt-0.5">${scopeBadge}</div>
            <div class="flex-grow min-w-0 pr-12">${ruleText}</div>
            <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button class="text-gray-400 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50 transition-colors" data-edit-id="${rule.id}" title="Edit Rule">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button class="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors" data-id="${rule.id}" title="Delete Rule">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `;

        div.querySelector('[data-id]').addEventListener('click', () => onDelete(rule.id));
        div.querySelector('[data-edit-id]').addEventListener('click', () => onEdit(rule.id));
        container.appendChild(div);
    });

    if (window.lucide) lucide.createIcons();
}

function renderDashboard(summary, globalErrors, dataSlice, resultsSlice, columns) {
    document.getElementById('empty-state-workspace').classList.add('hidden');
    const dash = document.getElementById('dashboard-container');
    dash.classList.remove('hidden');

    // Detect if this is a "Pre-Validation" state (i.e. only health scan or no rules run)
    const isPreValidation = resultsSlice.length === 0 || resultsSlice.every(r => !r.evaluations || r.evaluations.length === 0);

    // Update Stats
    document.getElementById('stat-total').textContent = summary.total.toLocaleString();

    if (isPreValidation) {
        document.getElementById('stat-passed').textContent = '-- PASSED';
        document.getElementById('stat-pass-pct').textContent = '--%';
        document.getElementById('stat-failed').textContent = '-- FAILED';
        document.getElementById('stat-fail-pct').textContent = '--%';
        document.getElementById('stat-score').textContent = '--';
    } else {
        document.getElementById('stat-passed').textContent = summary.passed.toLocaleString() + ' PASSED';
        document.getElementById('stat-pass-pct').textContent = summary.passPercentage + '%';
        document.getElementById('stat-failed').textContent = summary.failed.toLocaleString() + ' FAILED';
        document.getElementById('stat-fail-pct').textContent = (100 - Number(summary.passPercentage)).toFixed(1) + '%';
        document.getElementById('stat-score').textContent = summary.score;
    }

    // Global Errors, Warnings & Insights
    const errContainer = document.getElementById('global-errors-container');
    if (globalErrors && globalErrors.length > 0) {
        errContainer.classList.remove('hidden');

        const categories = {
            failures: {
                list: globalErrors.filter(e => e.startsWith('FAIL') || e.startsWith('ALGO:')),
                title: 'AGGREGATE VALIDATION FAILURES',
                icon: 'alert-circle',
                colors: { bg: 'from-red-50', border: 'border-red-500', text: 'text-red-700', itemBg: 'bg-red-100/30', itemBorder: 'border-red-100', itemText: 'text-red-600', dot: 'bg-red-400' }
            },
            warnings: {
                list: globalErrors.filter(e => e.startsWith('WARNING:')),
                title: 'DATA HEALTH WARNINGS',
                icon: 'alert-triangle',
                colors: { bg: 'from-amber-50', border: 'border-amber-500', text: 'text-amber-700', itemBg: 'bg-amber-100/30', itemBorder: 'border-amber-100', itemText: 'text-amber-600', dot: 'bg-amber-400' }
            },
            insights: {
                list: globalErrors.filter(e => e.startsWith('INSIGHT:')),
                title: 'DATA PROFILING INSIGHTS',
                icon: 'info',
                colors: { bg: 'from-blue-50', border: 'border-blue-500', text: 'text-blue-700', itemBg: 'bg-blue-100/30', itemBorder: 'border-blue-100', itemText: 'text-blue-600', dot: 'bg-blue-400' }
            },
            successes: {
                list: globalErrors.filter(e => e.startsWith('SUCCESS:')),
                title: 'VALIDATION CHECKS PASSED',
                icon: 'check-circle-2',
                colors: { bg: 'from-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700', itemBg: 'bg-emerald-100/30', itemBorder: 'border-emerald-100', itemText: 'text-emerald-600', dot: 'bg-emerald-400' }
            }
        };

        let html = '';
        Object.entries(categories).forEach(([key, cat]) => {
            if (cat.list.length > 0) {
                html += `
                <div class="bg-gradient-to-r ${cat.colors.bg} to-white border-l-4 ${cat.colors.border} p-4 rounded-r-xl shadow-sm mb-4 animate-in slide-in-from-top duration-500">
                    <div class="flex items-center gap-2 mb-3 ${cat.colors.text} font-bold tracking-tight">
                        <i data-lucide="${cat.icon}" class="w-5 h-5"></i>
                        <span>${cat.title}</span>
                    </div>
                    <div class="space-y-2">
                        ${cat.list.map(err => {
                    // Extract msg after prefix
                    let msg = err;
                    if (err.includes(':')) msg = err.split(':').slice(1).join(':').trim();
                    else if (err.startsWith('FAIL')) msg = err.replace(/^FAIL\s*(\[.*?\])?:\s*/, '').trim();

                    return `
                            <div class="text-sm ${cat.colors.itemText} flex items-start gap-2 ${cat.colors.itemBg} p-2 rounded-lg border ${cat.colors.itemBorder}">
                                <span class="mt-1.5 w-1.5 h-1.5 rounded-full ${cat.colors.dot} shrink-0"></span>
                                <span class="font-medium">${msg}</span>
                            </div>`;
                }).join('')}
                    </div>
                </div>`;
            }
        });

        errContainer.innerHTML = html;
    } else {
        errContainer.classList.add('hidden');
    }

    // Table
    const thead = document.getElementById('table-header');
    const tbody = document.getElementById('table-body');

    thead.innerHTML = `
        <th class="px-6 py-4 font-bold border-b bg-gray-50/50 text-gray-600 w-24 text-center tracking-wider">STATUS</th>
        <th class="px-6 py-4 font-bold border-b bg-gray-50/50 text-gray-600 min-w-[200px] tracking-wider text-left">RULE EXECUTION REPORT</th>
        ${columns.map(c => `<th class="px-6 py-4 font-bold border-b bg-gray-50/50 text-gray-600">${c.name.toUpperCase()}</th>`).join('')}
    `;

    tbody.innerHTML = dataSlice.map((row, i) => {
        const res = resultsSlice[i];
        const statusBadge = res.passed
            ? `<div class="flex items-center justify-center"><span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black tracking-widest shadow-sm">PASS</span></div>`
            : `<div class="flex items-center justify-center"><span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[10px] font-black tracking-widest shadow-sm">FAIL</span></div>`;

        let logicReport = '<span class="text-gray-300 font-light italic">No rules applied</span>';

        if (res.evaluations && res.evaluations.length > 0) {
            const groups = {};
            res.evaluations.forEach(ev => {
                const name = ev.ruleDesc.split(' ')[0];
                if (!groups[name]) groups[name] = { pass: 0, fail: 0, rules: [] };
                if (ev.passed) groups[name].pass++;
                else groups[name].fail++;
                groups[name].rules.push(`${ev.ruleDesc}: ${ev.passed ? 'PASS' : 'FAIL'}`);
            });

            logicReport = `<div class="flex flex-wrap gap-1.5">
                 ${Object.entries(groups).map(([name, stats]) => {
                const isFail = stats.fail > 0;
                const total = stats.pass + stats.fail;
                // Show count if > 1. If fail, show fail count.
                const label = total > 1 ? (isFail ? ` (${stats.fail}/${total})` : ` (${total})`) : '';

                return `
                    <div class="px-2 py-0.5 rounded text-[10px] font-bold border shadow-xs flex items-center gap-1 ${isFail ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}" title="${stats.rules.join('\n')}">
                        <i data-lucide="${isFail ? 'x-circle' : 'check-circle-2'}" class="w-3 h-3"></i>
                        <span>${name}${label}</span>
                    </div>`;
            }).join('')}
               </div>`;
        }

        const cells = columns.map(c => `
            <td class="px-6 py-4 border-b border-gray-50 text-sm text-gray-600 font-medium">
                ${row[c.name] !== null && row[c.name] !== undefined ? row[c.name] : '<span class="text-gray-200">null</span>'}
            </td>`).join('');

        return `
            <tr class="${res.isDuplicate ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'hover:bg-blue-50/20'} transition-all duration-150">
                <td class="px-6 py-4 border-b border-gray-50">
                    ${res.isDuplicate ? '<div class="flex flex-col items-center gap-1">' + statusBadge + '<span class="text-[9px] font-black text-amber-600 uppercase tracking-tight">Duplicate</span></div>' : statusBadge}
                </td>
                <td class="px-6 py-4 border-b border-gray-50">${logicReport}</td>
                ${cells}
            </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

window.UIRenderer = {
    updateFileInfo,
    renderColumns,
    renderRuleList,
    renderDashboard
};
