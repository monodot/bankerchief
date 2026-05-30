/**
 * <merchant-list> Web Component
 *
 * Ranks all expense transactions by merchant (normalised description),
 * summing totals across a selectable time window (3M / 6M / All).
 *
 * Usage:
 *   el.byMonth = { "2025-09": [...txns], ... }
 */
class MerchantList extends HTMLElement {
    #byMonth = {};
    #range   = 6;   // months; 0 = all time

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    set byMonth(val) {
        this.#byMonth = val ?? {};
        this.#render();
    }

    #merchants() {
        const sorted = Object.keys(this.#byMonth).sort();
        const keys   = this.#range === 0 ? sorted : sorted.slice(-this.#range);
        const txns   = keys.flatMap(k => this.#byMonth[k] ?? []);

        const map = new Map();
        for (const t of txns) {
            if (t.excluded || t.amount >= 0) continue;
            const norm = t.description.replace(/\s+/g, ' ').trim();
            const key  = norm.toLowerCase();
            const e    = map.get(key) ?? { description: norm, total: 0, count: 0 };
            e.total += Math.abs(t.amount);
            e.count++;
            map.set(key, e);
        }
        return [...map.values()].sort((a, b) => b.total - a.total);
    }

    #fmt(n) { return '£' + Math.round(n).toLocaleString('en-GB'); }

    #esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    #render() {
        const merchants  = this.#merchants();
        const range      = this.#range;
        const rangeLabel = range === 0 ? 'all time' : `last ${range} months`;
        const max        = merchants[0]?.total ?? 0;

        const rows = merchants.map((m, i) => `
            <div class="row">
                <span class="rank">${i + 1}</span>
                <div class="body">
                    <div class="line">
                        <span class="desc">${this.#esc(m.description)}</span>
                        <span class="total">${this.#fmt(m.total)}</span>
                    </div>
                    <div class="bar"><span class="fill" style="width:${max ? (m.total / max) * 100 : 0}%"></span></div>
                    <span class="meta">${m.count} txn${m.count !== 1 ? 's' : ''} · avg ${this.#fmt(m.total / m.count)}</span>
                </div>
            </div>`).join('');

        this.shadowRoot.innerHTML = `
            <style>${STYLES}</style>
            <div class="root">
                <div class="header-row">
                    <h2 class="heading">By merchant</h2>
                    <div class="range-toggle" role="group" aria-label="Time range">
                        <button class="range-btn ${range === 3 ? 'active' : ''}" data-range="3">3M</button>
                        <button class="range-btn ${range === 6 ? 'active' : ''}" data-range="6">6M</button>
                        <button class="range-btn ${range === 0 ? 'active' : ''}" data-range="0">All</button>
                    </div>
                </div>
                ${merchants.length === 0
                    ? '<p class="empty">No expense data found.</p>'
                    : `<p class="label">${merchants.length} merchants · ${rangeLabel}</p>
                       <div class="list">${rows}</div>`}
            </div>`;

        this.shadowRoot.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = +btn.dataset.range;
                if (n !== this.#range) { this.#range = n; this.#render(); }
            });
        });
    }
}

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

    .label {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.5625rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 0.625rem;
    }

    .list {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 1rem;
        padding: 0.5rem 1rem;
    }

    .row {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.625rem 0;
        border-bottom: 1px solid var(--border);
    }
    .row:last-child { border-bottom: none; }

    .rank {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.625rem;
        color: var(--muted);
        min-width: 1.25rem;
        padding-top: 0.1rem;
        text-align: right;
        flex-shrink: 0;
    }

    .body { flex: 1; min-width: 0; }

    .line {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
    }

    .desc {
        font-size: 0.8125rem;
        color: var(--text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .total {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--expense);
        white-space: nowrap;
        flex-shrink: 0;
    }

    .bar {
        height: 3px;
        border-radius: 2px;
        background: rgba(58, 48, 38, 0.07);
        margin: 0.375rem 0 0.25rem;
        overflow: hidden;
    }

    .fill {
        display: block;
        height: 100%;
        border-radius: 2px;
        background: var(--expense);
    }

    .meta {
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.5625rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
    }

    .empty {
        padding: 3rem 0;
        text-align: center;
        font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
        font-size: 0.8125rem;
        color: var(--muted);
    }
`;

customElements.define('merchant-list', MerchantList);
