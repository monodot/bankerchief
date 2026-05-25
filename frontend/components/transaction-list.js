/**
 * <transaction-list> — Web Component
 *
 * Usage:
 *   <transaction-list id="txn-list"></transaction-list>
 *
 * JS API:
 *   el.loading    = true          show a loading state
 *   el.error      = 'message'     show an error state
 *   el.data       = [ ...rows ]   render transactions
 *   el.categories = [ ...names ]  categories offered when drafting rules
 *
 * Each row must have: { date, description, amount, balance, account }
 *
 * Rule drafting is delegated to the shared draftStore + <draft-sheet>.
 */
import { draftStore } from '../draft-store.js';
import './category-donut.js';

class TransactionList extends HTMLElement {
    #data       = [];
    #loading    = false;
    #error      = null;
    #categories = [];
    #filter     = 'all';   // 'all' | 'uncategorised'
    #unsub      = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        // A draft change only affects the rows (taggable state + pills) — patch them,
        // not the whole view, which would tear down and rebuild the donut.
        this.#unsub = draftStore.subscribe(() => this.#fillRows());
    }

    disconnectedCallback() {
        this.#unsub?.();
    }

    // ── Public setters ──────────────────────────────────────────────────────

    /** Existing category names to offer in the picker (no re-render — `data` follows). */
    set categories(list) {
        this.#categories = Array.isArray(list) ? list : [];
    }

    set loading(val) {
        this.#loading = Boolean(val);
        this.#error   = null;
        this.#render();
    }

    set error(msg) {
        this.#error   = String(msg);
        this.#loading = false;
        this.#render();
    }

    set data(rows) {
        this.#data    = Array.isArray(rows) ? rows : [];
        this.#loading = false;
        this.#error   = null;
        this.#render();
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    #render() {
        const root = this.shadowRoot;

        if (this.#loading) {
            root.innerHTML = this.#shell(`
                <div class="state">
                    <span class="spinner"></span>
                    Loading transactions…
                </div>
            `);
            return;
        }

        if (this.#error) {
            root.innerHTML = this.#shell(`
                <div class="state error">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 3.5h1.5v4.5h-1.5V4.5Zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75Z"/>
                    </svg>
                    ${this.#esc(this.#error)}
                </div>
            `);
            return;
        }

        if (this.#data.length === 0) {
            root.innerHTML = this.#shell(`
                <div class="state">No transactions found.</div>
            `);
            return;
        }

        root.innerHTML = this.#shell(`
            <div class="summary-bar">
                ${this.#summary()}
            </div>
            <category-donut></category-donut>
            <div class="list-controls">
                <div class="filter-toggle" role="group" aria-label="Filter transactions">
                    <button class="filter-btn ${this.#filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
                    <button class="filter-btn ${this.#filter === 'uncategorised' ? 'active' : ''}" data-filter="uncategorised">Uncategorised</button>
                </div>
            </div>
            <div class="list-area"></div>
        `);

        const donut = root.querySelector('category-donut');
        donut.heading      = 'Expenses by category';
        donut.transactions = this.#data;

        this.#fillRows();
        this.#bind();
    }

    /** Fill the list area for the current filter + draft state (keeps the donut intact). */
    #fillRows() {
        const area = this.shadowRoot.querySelector('.list-area');
        if (!area) return;

        const visible = this.#filter === 'uncategorised'
            ? this.#data.filter(t => (t.category || 'Uncategorised') === 'Uncategorised')
            : this.#data;

        area.innerHTML = visible.length
            ? `<ul class="list">${visible.map(t => this.#row(t)).join('')}</ul>`
            : `<div class="state">No uncategorised transactions.</div>`;
    }

    /** Render one transaction row. */
    #row(t) {
        const isCredit = t.amount >= 0;
        const amtClass = t.excluded ? 'transfer' : (isCredit ? 'credit' : 'debit');
        const sign     = isCredit ? '+' : '−';
        const amount   = this.#fmt(Math.abs(t.amount));
        const balance  = Number.isFinite(t.balance) ? this.#fmt(t.balance) : '';
        const date     = this.#fmtDate(t.date);
        const desc     = this.#esc(this.#cleanDesc(t.description));
        const account  = this.#esc(t.account ?? '');
        const category = t.category && t.category !== 'Uncategorised' ? this.#esc(t.category) : '';

        const key       = draftStore.key(t);
        const tag       = draftStore.tag(key);
        const draftPill = tag
            ? `<span class="draft-pill">${this.#esc(tag.category)}${tag.scope === 'all' ? ' · all' : ''}</span>`
            : '';

        return `
            <li class="row ${draftStore.mode ? 'taggable' : ''}" data-key="${this.#esc(key)}">
                <span class="date">${date}</span>
                <span class="desc">
                    ${desc}
                    <span class="meta">
                        ${account ? `<span class="account">${account}</span>` : ''}
                        ${category ? `<span class="category">${category}</span>` : ''}
                        ${draftPill}
                    </span>
                </span>
                <span class="amount ${amtClass}">${sign}${amount}</span>
                <span class="balance">${balance}</span>
            </li>
        `;
    }

    /** Summary bar: total in, total out, transfers, net. */
    #summary() {
        let totalIn = 0, totalOut = 0, transfers = 0;
        for (const t of this.#data) {
            if (t.excluded)         transfers += Math.abs(t.amount);
            else if (t.amount >= 0) totalIn   += t.amount;
            else                    totalOut  += Math.abs(t.amount);
        }
        const net = totalIn - totalOut;
        const netClass = net >= 0 ? 'credit' : 'debit';
        const netSign  = net >= 0 ? '+' : '−';

        return `
            <span class="summary-item">
                <span class="summary-label">In</span>
                <span class="summary-value credit">+${this.#fmt(totalIn)}</span>
            </span>
            <span class="summary-sep"></span>
            <span class="summary-item">
                <span class="summary-label">Out</span>
                <span class="summary-value debit">−${this.#fmt(totalOut)}</span>
            </span>
            ${transfers > 0 ? `
                <span class="summary-sep"></span>
                <span class="summary-item">
                    <span class="summary-label">Transfers</span>
                    <span class="summary-value transfer">⇄${this.#fmt(transfers)}</span>
                </span>
            ` : ''}
            <span class="summary-sep"></span>
            <span class="summary-item">
                <span class="summary-label">Net</span>
                <span class="summary-value ${netClass}">${netSign}${this.#fmt(Math.abs(net))}</span>
            </span>
            <span class="summary-count">${this.#data.length} transactions</span>
        `;
    }

    #bind() {
        this.shadowRoot.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.filter !== this.#filter) {
                    this.#filter = btn.dataset.filter;
                    this.shadowRoot.querySelectorAll('.filter-btn').forEach(b =>
                        b.classList.toggle('active', b.dataset.filter === this.#filter));
                    this.#fillRows();
                }
            });
        });

        // Delegated on the persistent list area so it survives row patches; when
        // drafting, tapping a row opens the shared picker.
        this.shadowRoot.querySelector('.list-area')?.addEventListener('click', e => {
            if (!draftStore.mode) return;
            const li = e.target.closest('.row');
            if (!li) return;
            const t = this.#data.find(x => draftStore.key(x) === li.dataset.key);
            if (t) document.querySelector('draft-sheet')?.openPicker(t, this.#categories);
        });
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** Format a number as currency (GBP). */
    #fmt(n) {
        return '£' + n.toLocaleString('en-GB', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    /** Format an ISO date string as "28 Sep". */
    #fmtDate(iso) {
        const d = new Date(iso + 'T00:00:00');   // force local, not UTC
        return d.toLocaleString('en-GB', { day: 'numeric', month: 'short' });
    }

    /** Collapse internal runs of whitespace in a description string. */
    #cleanDesc(s) {
        return s.replace(/\s+/g, ' ').trim();
    }

    /** Basic HTML entity escaping to prevent injection. */
    #esc(s) {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Wrap content in the shadow-root shell with <style> and a container. */
    #shell(content) {
        return `<style>${STYLES}</style><div class="root">${content}</div>`;
    }
}

// ── Styles (Shadow DOM — fully encapsulated) ──────────────────────────────────

const STYLES = `
    :host {
        display: block;
        --mono: ui-monospace, Menlo, Monaco, Consolas, monospace;
    }

    /* ── States ── */
    .state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 3rem 1rem;
        font-size: 0.875rem;
        color: var(--muted);
        font-family: var(--mono);
        letter-spacing: 0.03em;
    }

    .state.error { color: var(--expense); }

    .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(58, 48, 38, 0.15);
        border-top-color: rgba(58, 48, 38, 0.6);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        flex-shrink: 0;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Summary bar ── */
    .summary-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 0;
        border-bottom: 1px solid var(--border);
        margin-bottom: 0.25rem;
        flex-wrap: wrap;
    }

    .summary-item {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }

    .summary-label {
        font-family: var(--mono);
        font-size: 0.5625rem;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--muted);
    }

    .summary-value {
        font-family: var(--mono);
        font-size: 0.9375rem;
        font-weight: 500;
        letter-spacing: -0.01em;
    }

    .summary-sep {
        width: 1px;
        height: 28px;
        background: var(--border);
        flex-shrink: 0;
    }

    .summary-count {
        margin-left: auto;
        font-family: var(--mono);
        font-size: 0.5625rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
        align-self: flex-end;
    }

    /* ── Filter toggle ── */
    .list-controls {
        display: flex;
        justify-content: flex-end;
        padding: 0.5rem 0 0.75rem;
    }

    .filter-toggle {
        display: inline-flex;
        flex-shrink: 0;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        overflow: hidden;
        background: var(--surface);
    }

    .filter-btn {
        font-family: var(--mono);
        font-size: 0.6875rem;
        letter-spacing: 0.05em;
        padding: 0.375rem 0.75rem;
        border: none;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        transition: background 0.1s, color 0.1s;
    }
    .filter-btn + .filter-btn { border-left: 1px solid var(--border); }
    .filter-btn.active { background: var(--accent); color: #FFFCF7; }

    /* ── Transaction list ── */
    .list {
        list-style: none;
    }

    .row {
        display: grid;
        /* date | description | amount | balance */
        grid-template-columns: 3.75rem 1fr auto auto;
        grid-template-rows: auto;
        column-gap: 0.75rem;
        align-items: center;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--border);
    }

    .row:last-child { border-bottom: none; }

    .date {
        font-family: var(--mono);
        font-size: 0.6875rem;
        color: var(--muted);
        letter-spacing: 0.02em;
        white-space: nowrap;
    }

    .desc {
        font-size: 0.8125rem;
        color: var(--text);
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .account {
        font-family: var(--mono);
        font-size: 0.5rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
    }

    .amount {
        font-family: var(--mono);
        font-size: 0.8125rem;
        font-weight: 500;
        letter-spacing: -0.01em;
        white-space: nowrap;
        text-align: right;
    }

    .balance {
        font-family: var(--mono);
        font-size: 0.6875rem;
        color: var(--muted);
        white-space: nowrap;
        text-align: right;
        min-width: 5.5rem;
    }

    /* Colour coding */
    .credit { color: var(--income); }
    .debit  { color: var(--expense); }
    .transfer { color: var(--accent); }

    .meta {
        display: flex;
        gap: 0.4rem;
        align-items: center;
    }

    .category {
        font-family: var(--mono);
        font-size: 0.5rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--accent);
        border: 1px solid rgba(15, 110, 120, 0.3);
        border-radius: 3px;
        padding: 0.05rem 0.3rem;
    }

    /* ── Draft: taggable rows + draft pill ── */
    .row.taggable { cursor: pointer; }
    .row.taggable:hover { background: rgba(15,110,120,0.05); }

    .draft-pill {
        font-family: var(--mono);
        font-size: 0.5rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--accent);
        border: 1px dashed rgba(15,110,120,0.55);
        border-radius: 3px;
        padding: 0.05rem 0.3rem;
        font-style: italic;
    }

    /* ── Mobile: hide balance column on narrow screens ── */
    @media (max-width: 420px) {
        .row {
            grid-template-columns: 3.25rem 1fr auto;
        }
        .balance { display: none; }
    }
`;

customElements.define('transaction-list', TransactionList);
