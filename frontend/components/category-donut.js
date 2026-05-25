/**
 * <category-donut> — Web Component
 *
 * A doughnut chart of expenses grouped by category, largest first, with the
 * running total drawn in the hole. Computes the breakdown from the transactions
 * it's handed, so callers just pass rows and (optionally) a heading + centre label.
 *
 * Usage:
 *   const d = document.createElement('category-donut');
 *   d.heading = 'Expenses by category';   // optional title above the chart
 *   d.label   = 'TOTAL OUT';              // optional centre label
 *   d.transactions = [ ...txns ];         // triggers render
 *
 * Renders nothing when there are no expense rows.
 */
class CategoryDonut extends HTMLElement {
    #chart   = null;
    #txns    = [];
    #heading = '';
    #label   = 'TOTAL OUT';

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    disconnectedCallback() {
        this.#destroy();
    }

    set heading(val) { this.#heading = val ?? ''; }
    set label(val)   { this.#label   = val ?? ''; }

    set transactions(rows) {
        this.#txns = Array.isArray(rows) ? rows : [];
        this.#render();
    }

    #destroy() {
        if (this.#chart) { this.#chart.destroy(); this.#chart = null; }
    }

    #fmt(n) {
        return '£' + Math.round(n).toLocaleString('en-GB');
    }

    /** Expenses by category across the given rows, largest first. */
    #expensesByCategory() {
        const totals = {};
        for (const t of this.#txns) {
            if (t.excluded || t.amount >= 0) continue;
            const cat = t.category || 'Uncategorised';
            totals[cat] = (totals[cat] || 0) + Math.abs(t.amount);
        }
        return Object.entries(totals).sort((a, b) => b[1] - a[1]);
    }

    #render() {
        this.#destroy();

        const catData = this.#expensesByCategory();
        if (catData.length === 0) {
            this.shadowRoot.innerHTML = '';
            return;
        }
        const total = catData.reduce((sum, [, v]) => sum + v, 0);

        this.shadowRoot.innerHTML = `
            <style>${STYLES}</style>
            ${this.#heading ? `<p class="chart-title">${this.#heading}</p>` : ''}
            <div class="chart-card">
                <div class="chart-wrap">
                    <canvas></canvas>
                </div>
            </div>
        `;

        this.#initDonut(catData, total);
    }

    #initDonut(catData, total) {
        const canvas = this.shadowRoot.querySelector('canvas');
        if (!canvas || !window.Chart) return;

        const labels = catData.map(([cat]) => cat);
        const data   = catData.map(([, v]) => v);

        this.#chart = new window.Chart(canvas, {
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
                    centerText: { label: this.#label, text: this.#fmt(total) },
                    legend: {
                        position: 'right',
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

const STYLES = `
    :host { display: block; }

    .chart-title {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.5625rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 0.625rem;
    }

    .chart-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 1rem;
        margin-bottom: 1.5rem;
    }

    .chart-wrap {
        position: relative;
        height: 300px;
    }
`;

customElements.define('category-donut', CategoryDonut);
