/**
 * <home-view> Web Component
 *
 * Displays an income-vs-expense bar chart and an expenses-by-category donut
 * over a selectable window (last 3 or 6 months), toggled by a button group,
 * followed by a clickable list of all available months.
 *
 * Usage:
 *   el.byMonth = { "2025-09": [...txns], "2025-10": [...txns], ... }
 */
class HomeView extends HTMLElement {
    #chart   = null;
    #donut   = null;
    #byMonth = {};
    #range   = 6;   // months shown in both charts; toggled by the 3M/6M group

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    set byMonth(val) {
        this.#byMonth = val ?? {};
        this.#render();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    #fmtKey(key, style = 'short') {
        const [y, m] = key.split('-');
        return new Date(+y, +m - 1, 1)
            .toLocaleString('en-GB', { month: style, year: 'numeric' });
    }

    #summarise(txns) {
        let income = 0, expense = 0, transfers = 0;
        for (const t of txns) {
            if (t.excluded)         transfers += Math.abs(t.amount);
            else if (t.amount >= 0) income    += t.amount;
            else                    expense   += Math.abs(t.amount);
        }
        return { income, expense, transfers, net: income - expense, count: txns.length };
    }

    #fmt(n) {
        return '£' + Math.round(n).toLocaleString('en-GB');
    }

    /** Expenses by category across the given month keys, largest first. */
    #expensesByCategory(keys) {
        const totals = {};
        for (const k of keys) {
            for (const t of this.#byMonth[k] ?? []) {
                if (t.excluded || t.amount >= 0) continue;
                const cat = t.category || 'Uncategorised';
                totals[cat] = (totals[cat] || 0) + Math.abs(t.amount);
            }
        }
        return Object.entries(totals).sort((a, b) => b[1] - a[1]);
    }

    #monthLetter(key) {
        const [y, m] = key.split('-');
        return new Date(+y, +m - 1, 1).toLocaleString('en-GB', { month: 'narrow' });
    }

    /**
     * Per-account data coverage across a contiguous month axis.
     * A cell is 'on' (has data), 'gap' (no data *between* the account's first
     * and last month — a hole, almost certainly a forgotten upload), or 'off'
     * (no data before/after the account's span — benign). Returns null with
     * fewer than two accounts, where a comparison would be meaningless.
     */
    #coverage() {
        const present = {};   // account → Set of "YYYY-MM" with ≥1 txn
        for (const [month, txns] of Object.entries(this.#byMonth)) {
            for (const t of txns) (present[t.account] ??= new Set()).add(month);
        }
        const accounts = Object.keys(present).sort();
        if (accounts.length < 2) return null;

        const sorted = Object.keys(this.#byMonth).sort();
        const months = monthRange(sorted[0], sorted[sorted.length - 1]);

        const rows = accounts.map(account => {
            const has   = present[account];
            const owned = months.filter(m => has.has(m));
            const first = owned[0], last = owned[owned.length - 1];
            const cells = months.map(m => {
                if (has.has(m))            return 'on';
                if (m > first && m < last) return 'gap';
                return 'off';
            });
            return { account, cells };
        });

        return { months, rows };
    }

    // ── Render ───────────────────────────────────────────────────────────────

    #render() {
        // Destroy any existing Chart.js instances before wiping the DOM
        if (this.#chart) { this.#chart.destroy(); this.#chart = null; }
        if (this.#donut) { this.#donut.destroy(); this.#donut = null; }

        const sortedKeys = Object.keys(this.#byMonth).sort();       // oldest → newest
        const range      = this.#range;
        const windowKeys = sortedKeys.slice(-range);
        const allDesc    = [...sortedKeys].reverse();                // newest first for list

        const catData    = this.#expensesByCategory(windowKeys);
        const catTotal   = catData.reduce((sum, [, v]) => sum + v, 0);
        const coverage   = this.#coverage();

        const summaries  = Object.fromEntries(
            sortedKeys.map(k => [k, this.#summarise(this.#byMonth[k])])
        );

        const monthRows = allDesc.map(k => {
            const s       = summaries[k];
            const netSign = s.net >= 0 ? '+' : '−';
            const netCls  = s.net >= 0 ? 'credit' : 'debit';
            return `
                <a class="month-row" href="#month/${k}">
                    <span class="month-name">${this.#fmtKey(k, 'short')}</span>
                    <span class="month-stats">
                        <span class="credit">+${this.#fmt(s.income)}</span>
                        <span class="debit">−${this.#fmt(s.expense)}</span>
                        ${s.transfers > 0 ? `<span class="transfer">⇄${this.#fmt(s.transfers)}</span>` : ''}
                        <span class="${netCls} net">${netSign}${this.#fmt(Math.abs(s.net))}</span>
                    </span>
                    <span class="count">${s.count}</span>
                    <span class="arrow">›</span>
                </a>`;
        }).join('');

        this.shadowRoot.innerHTML = `
            <style>${STYLES}</style>
            <div class="root">
                <div class="header-row">
                    <h2 class="heading">Overview</h2>
                    <div class="range-toggle" role="group" aria-label="Time range">
                        <button class="range-btn ${range === 3 ? 'active' : ''}" data-range="3">3M</button>
                        <button class="range-btn ${range === 6 ? 'active' : ''}" data-range="6">6M</button>
                    </div>
                </div>
                ${windowKeys.length > 0 ? `
                    <p class="chart-title">Income vs expense · last ${range} months</p>
                    <div class="chart-card">
                        <div class="chart-wrap">
                            <canvas id="chart"></canvas>
                        </div>
                    </div>
                ` : ''}

                ${catData.length > 0 ? `
                    <p class="chart-title">Expenses by category · last ${range} months</p>
                    <div class="chart-card">
                        <div class="chart-wrap donut-wrap">
                            <canvas id="donut"></canvas>
                        </div>
                    </div>
                ` : ''}


                ${coverage ? `
                    <p class="chart-title">Coverage · data uploaded by account</p>
                    <div class="coverage-card">
                        <div class="cov-grid">
                            <div class="cov-row">
                                <span class="cov-label"></span>
                                <span class="cov-cells">
                                    ${coverage.months.map(m => `<span class="cov-tick">${this.#monthLetter(m)}</span>`).join('')}
                                </span>
                            </div>
                            ${coverage.rows.map(r => `
                                <div class="cov-row">
                                    <span class="cov-label">${r.account}</span>
                                    <span class="cov-cells">
                                        ${r.cells.map(c => `<span class="cov-cell ${c}"></span>`).join('')}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                        <p class="cov-caption">${this.#fmtKey(coverage.months[0])} → ${this.#fmtKey(coverage.months[coverage.months.length - 1])}</p>
                    </div>
                ` : ''}

                ${allDesc.length > 0 ? `
                    <p class="section-label">All months</p>
                    <div class="month-list">${monthRows}</div>
                ` : `<p class="empty">No transaction data found.</p>`}
            </div>
        `;

        if (windowKeys.length > 0) {
            this.#initChart(windowKeys, summaries);
        }
        if (catData.length > 0) {
            this.#initDonut(catData, catTotal);
        }

        this.shadowRoot.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = +btn.dataset.range;
                if (n !== this.#range) { this.#range = n; this.#render(); }
            });
        });
    }

    // ── Chart.js ─────────────────────────────────────────────────────────────

    #initChart(keys, summaries) {
        const canvas = this.shadowRoot.getElementById('chart');
        if (!canvas || !window.Chart) return;

        this.#chart = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels: keys.map(k => this.#fmtKey(k, 'short')),
                datasets: [
                    {
                        label: 'Income',
                        data: keys.map(k => summaries[k].income),
                        backgroundColor: 'rgba(63, 115, 80, 0.85)',
                        borderRadius: 5,
                        borderSkipped: false,
                    },
                    {
                        label: 'Expenses',
                        data: keys.map(k => summaries[k].expense),
                        backgroundColor: 'rgba(168, 69, 58, 0.85)',
                        borderRadius: 5,
                        borderSkipped: false,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'start',
                        labels: {
                            color: 'rgba(51,48,43,0.7)',
                            usePointStyle: true,
                            pointStyle: 'rect',
                            boxWidth: 10,
                            boxHeight: 10,
                            font: { family: "ui-monospace, Menlo, Monaco, Consolas, monospace", size: 10 },
                            padding: 16,
                        },
                    },
                    tooltip: {
                        backgroundColor: '#33302B',
                        borderColor: 'rgba(58,48,38,0.2)',
                        borderWidth: 1,
                        titleColor: 'rgba(251,244,236,0.95)',
                        bodyColor:  'rgba(251,244,236,0.7)',
                        padding: 10,
                        callbacks: {
                            label: ctx =>
                                ` ${ctx.dataset.label}: £${Math.round(ctx.parsed.y).toLocaleString('en-GB')}`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid:   { display: false },
                        border: { display: false },
                        ticks:  {
                            color: 'rgba(51,48,43,0.55)',
                            font:  { family: "ui-monospace, Menlo, Monaco, Consolas, monospace", size: 10 },
                        },
                    },
                    y: {
                        grid:   { color: 'rgba(58,48,38,0.10)', drawTicks: false },
                        border: { display: false },
                        ticks:  {
                            color: 'rgba(51,48,43,0.55)',
                            font:  { family: "ui-monospace, Menlo, Monaco, Consolas, monospace", size: 10 },
                            padding: 8,
                            callback: v => '£' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v),
                        },
                    },
                },
            },
        });
    }

    #initDonut(catData, total) {
        const canvas = this.shadowRoot.getElementById('donut');
        if (!canvas || !window.Chart) return;

        const labels = catData.map(([cat]) => cat);
        const data   = catData.map(([, v]) => v);

        this.#donut = new window.Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
                    borderColor: '#FFFCF7',
                    borderWidth: 2,
                }],
            },
            plugins: [CENTER_TEXT],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '66%',
                plugins: {
                    centerText: { label: 'TOTAL OUT', text: this.#fmt(total) },
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'rgba(51,48,43,0.7)',
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8,
                            boxHeight: 8,
                            font: { family: "ui-monospace, Menlo, Monaco, Consolas, monospace", size: 10 },
                            padding: 12,
                        },
                    },
                    tooltip: {
                        backgroundColor: '#33302B',
                        borderColor: 'rgba(58,48,38,0.2)',
                        borderWidth: 1,
                        titleColor: 'rgba(251,244,236,0.95)',
                        bodyColor:  'rgba(251,244,236,0.7)',
                        padding: 10,
                        callbacks: {
                            label: ctx => {
                                const pct = total ? Math.round((ctx.parsed / total) * 100) : 0;
                                return ` ${ctx.label}: £${Math.round(ctx.parsed).toLocaleString('en-GB')} (${pct}%)`;
                            },
                        },
                    },
                },
            },
        });
    }
}

/** Contiguous list of "YYYY-MM" keys from start to end, inclusive. */
function monthRange(start, end) {
    const out = [];
    let [y, m] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        if (++m > 12) { m = 1; y++; }
    }
    return out;
}

// Draws the total in the hole of the doughnut. Reads options.plugins.centerText.
const CENTER_TEXT = {
    id: 'centerText',
    afterDraw(chart, _args, opts) {
        if (!opts?.text) return;
        const arc = chart.getDatasetMeta(0).data[0];
        if (!arc) return;

        const { ctx } = chart;
        const { x, y } = arc;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (opts.label) {
            ctx.fillStyle = 'rgba(51,48,43,0.55)';
            ctx.font = "600 9px ui-monospace, Menlo, Monaco, Consolas, monospace";
            ctx.fillText(opts.label, x, y - 14);
        }
        ctx.fillStyle = '#33302B';
        ctx.font = "600 20px system-ui, -apple-system, sans-serif";
        ctx.fillText(opts.text, x, y + 5);
        ctx.restore();
    },
};

// Earthy palette for category segments, cycled if categories exceed its length.
const PALETTE = [
    '#A8453A', '#0F6E78', '#C2843E', '#3F7350', '#7A5C9E',
    '#6B8E9E', '#B5654E', '#8A7E6E', '#9E7B4F', '#4F7A6B',
];

// ── Shadow DOM styles ─────────────────────────────────────────────────────────

const STYLES = `
    :host { display: block; }

    .header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1.25rem;
    }

    .heading {
        font-family: Georgia, 'Times New Roman', serif;
        font-style: italic;
        font-weight: 300;
        font-size: 1.5rem;
        color: var(--text);
    }

    .range-toggle {
        display: inline-flex;
        flex-shrink: 0;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        overflow: hidden;
        background: var(--surface);
    }

    .range-btn {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.6875rem;
        letter-spacing: 0.05em;
        padding: 0.375rem 0.75rem;
        border: none;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        transition: background 0.1s, color 0.1s;
    }
    .range-btn + .range-btn { border-left: 1px solid var(--border); }
    .range-btn.active { background: var(--accent); color: #FFFCF7; }

    /* Chart */
    .chart-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 1rem 1rem 0.75rem;
        margin-bottom: 1.5rem;
    }

    .chart-wrap {
        position: relative;
        height: 220px;
    }

    .donut-wrap { height: 300px; }

    .chart-title {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.5625rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 0.625rem;
    }

    /* Coverage matrix */
    .coverage-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 1rem;
        margin-bottom: 1.5rem;
    }

    .cov-grid { display: flex; flex-direction: column; gap: 0.375rem; }

    .cov-row { display: flex; align-items: center; gap: 0.5rem; }

    .cov-label {
        width: 5.5rem;
        flex-shrink: 0;
        text-align: right;
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.625rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .cov-cells { display: flex; flex: 1; gap: 2px; }

    .cov-tick {
        flex: 1;
        text-align: center;
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.5rem;
        color: var(--muted);
    }

    .cov-cell {
        flex: 1;
        height: 1.25rem;
        border-radius: 2px;
        background: rgba(58, 48, 38, 0.07);
    }
    .cov-cell.on  { background: var(--accent); }
    .cov-cell.gap { background: var(--expense); }

    .cov-caption {
        margin-top: 0.625rem;
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.5625rem;
        letter-spacing: 0.05em;
        color: var(--muted);
        text-align: right;
    }

    /* Month list */
    .section-label {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.5625rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
        padding-bottom: 0.625rem;
        border-bottom: 1px solid var(--border);
    }

    .month-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 0;
        border-bottom: 1px solid var(--border);
        text-decoration: none;
        color: inherit;
        transition: opacity 0.1s;
    }
    .month-row:last-child { border-bottom: none; }
    .month-row:hover  { opacity: 0.75; }
    .month-row:active { opacity: 0.5; }

    .month-name {
        font-size: 0.9375rem;
        color: var(--text);
        min-width: 4.5rem;
        flex-shrink: 0;
    }

    .month-stats {
        display: flex;
        flex: 1;
        gap: 0.625rem;
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.75rem;
        flex-wrap: wrap;
    }

    .net   { font-weight: 500; }
    .credit { color: var(--income); }
    .debit  { color: var(--expense); }
    .transfer { color: var(--accent); }

    .count {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.625rem;
        color: var(--muted);
        flex-shrink: 0;
    }

    .arrow {
        color: var(--muted);
        font-size: 1.25rem;
        line-height: 1;
        flex-shrink: 0;
    }

    .empty {
        padding: 3rem 0;
        text-align: center;
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.8125rem;
        color: var(--muted);
    }
`;

customElements.define('home-view', HomeView);
