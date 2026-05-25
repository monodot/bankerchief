// app.js — entry point
// Fetches all transaction data, then routes between the home view
// (overview chart + month list) and the per-month transaction list.

import './components/home-view.js';
import './components/transaction-list.js';

const DATA_BASE = '/data/';

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function getJson(url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

async function getText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.text();
}

// ── CSV parsing ──────────────────────────────────────────────────────────────
// Opt-in per account via a `format.json` hint, e.g.
//   { "format": "csv", "dateFormat": "DD/MM/YYYY",
//     "columns": { "date": "Date", "description": "Description", "amount": "Amount" },
//     "flipSign": true }
// For a headerless CSV set "noHeader": true and reference columns by 0-based
// index. `amount` may be an array of indices (first non-empty wins) for exports
// that split debits/credits across two columns.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function toIsoDate(value, fmt) {
    if (fmt === 'DD/MM/YYYY') {
        const [d, m, y] = value.split('/');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    if (fmt === 'DD Mon YY') {                // e.g. "22 Apr 26"
        const [d, mon, y] = value.split(/\s+/);
        const m = String(MONTHS.indexOf(mon) + 1).padStart(2, '0');
        return `20${y}-${m}-${d.padStart(2, '0')}`;
    }
    return value;   // assume already ISO
}

/** Split a CSV line, respecting double-quoted fields (RFC 4180). */
function splitCsvLine(line) {
    const cells = []; let cur = '', q = false;
    for (const ch of line) {
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
        else cur += ch;
    }
    return [...cells, cur];
}

function parseCsv(text, fmt) {
    const cols  = fmt.columns ?? { date: 'Date', description: 'Description', amount: 'Amount' };
    const lines = text.trim().split(/\r?\n/);
    const head  = fmt.noHeader ? null : splitCsvLine(lines.shift()).map(h => h.trim());
    const at    = col => head ? head.indexOf(col) : col;        // header name → index, or pass-through
    const cell  = (cells, col) => (cells[at(col)] ?? '').trim();

    return lines.filter(Boolean).map(line => {
        const cells   = splitCsvLine(line);
        const amtCols = Array.isArray(cols.amount) ? cols.amount : [cols.amount];
        const raw     = amtCols.map(c => cell(cells, c)).find(Boolean) ?? '';
        const amount  = parseFloat(raw.replace(/,/g, ''));      // strip thousands separators
        return {
            date:        toIsoDate(cell(cells, cols.date), fmt.dateFormat),
            description: cell(cells, cols.description),
            amount:      fmt.flipSign ? -amount : amount,
        };
    });
}

// ── Categorisation ─────────────────────────────────────────────────────────

/** { categories: { name: { isExpense } }, rules: [ { match, category } ] } */
let rules = { categories: {}, rules: [] };

// Collapse whitespace + lowercase so "VANGUARD LONDON" matches "VANGUARD   LONDON".
const normalise = s => s.replace(/\s+/g, ' ').trim().toLowerCase();

async function loadRules() {
    try {
        rules = await getJson(`${DATA_BASE}rules.json`);
    } catch {
        rules = { categories: {}, rules: [] };   // no rules file → all Uncategorised
    }
}

/** First matching rule wins; no match → "Uncategorised". */
function classify(txn) {
    const desc = normalise(txn.description);
    for (const r of rules.rules) {
        if (r.date && r.date !== txn.date) continue;   // date-scoped rule, wrong day
        if (desc.includes(normalise(r.match))) return r.category;
    }
    return 'Uncategorised';
}

/** Transfer categories (isExpense:false) count as neither income nor expense. */
function isExcluded(category) {
    return rules.categories[category]?.isExpense === false;
}

const RESERVED = new Set(['format.json']);

async function discoverFiles() {
    const topLevel = await getJson(DATA_BASE);
    const files = [];

    for (const entry of topLevel) {
        if (!entry.is_dir) continue;

        const account  = entry.name.replace(/\/$/, '');
        const dirUrl   = `${DATA_BASE}${entry.name}`;
        const contents = await getJson(dirUrl);

        // Optional per-account parse hint.
        const format = contents.some(f => f.name === 'format.json')
            ? await getJson(`${dirUrl}format.json`)
            : null;

        for (const file of contents) {
            if (file.is_dir || RESERVED.has(file.name)) continue;
            if (!file.name.endsWith('.json') && !file.name.endsWith('.csv')) continue;
            files.push({ url: `${dirUrl}${file.name}`, account, format });
        }
    }

    return files;
}

// ── State ────────────────────────────────────────────────────────────────────

/** Transactions grouped by "YYYY-MM" key, e.g. { "2025-09": [...] } */
let byMonth = {};

function groupByMonth(txns) {
    return txns.reduce((acc, t) => {
        const key = t.date.slice(0, 7);
        (acc[key] = acc[key] || []).push(t);
        return acc;
    }, {});
}

/** "2025-09" → "September 2025" */
function fmtMonthKey(key) {
    const [y, m] = key.split('-');
    return new Date(+y, +m - 1, 1)
        .toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

// ── Routing ──────────────────────────────────────────────────────────────────

const viewRoot = document.getElementById('view-root');
const backBtn  = document.getElementById('back-btn');

function route() {
    const hash = window.location.hash;

    if (hash.startsWith('#month/')) {
        const key  = hash.slice(7);           // e.g. "2025-09"
        const txns = byMonth[key] || [];

        backBtn.hidden = false;
        viewRoot.innerHTML = `
            <h2 class="view-heading">${fmtMonthKey(key)}</h2>
            <transaction-list></transaction-list>
        `;
        viewRoot.querySelector('transaction-list').data = txns;

    } else {
        backBtn.hidden = true;
        viewRoot.innerHTML = '<home-view></home-view>';
        viewRoot.querySelector('home-view').byMonth = byMonth;
    }
}

window.addEventListener('hashchange', route);

// ── Data loading ─────────────────────────────────────────────────────────────

const refreshBtn = document.getElementById('refresh-btn');

async function loadData() {
    refreshBtn.setAttribute('aria-busy', 'true');
    refreshBtn.disabled = true;

    try {
        await loadRules();
        const files = await discoverFiles();

        const results = await Promise.all(
            files.map(async f => {
                const rows = f.format?.format === 'csv'
                    ? parseCsv(await getText(f.url), f.format)
                    : await getJson(f.url);
                return rows.map(t => {
                    const category = classify(t);
                    return { ...t, account: f.account, category, excluded: isExcluded(category) };
                });
            })
        );

        const all = results.flat().sort((a, b) => b.date.localeCompare(a.date));
        byMonth = groupByMonth(all);

    } catch (err) {
        console.error(err);
        viewRoot.innerHTML = `
            <p style="font-family:var(--font-mono);font-size:.8rem;color:var(--expense);padding:2rem 0">
                Error loading data: ${err.message}
            </p>`;
        return;
    } finally {
        refreshBtn.removeAttribute('aria-busy');
        refreshBtn.disabled = false;
    }

    route();
}

refreshBtn.addEventListener('click', loadData);

loadData();
