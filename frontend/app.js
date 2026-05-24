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
        if (desc.includes(normalise(r.match))) return r.category;
    }
    return 'Uncategorised';
}

/** Transfer categories (isExpense:false) count as neither income nor expense. */
function isExcluded(category) {
    return rules.categories[category]?.isExpense === false;
}

async function discoverFiles() {
    const topLevel = await getJson(DATA_BASE);
    const files = [];

    for (const entry of topLevel) {
        if (!entry.is_dir) continue;

        const account  = entry.name.replace(/\/$/, '');
        const dirUrl   = `${DATA_BASE}${entry.name}`;
        const contents = await getJson(dirUrl);

        for (const file of contents) {
            if (file.is_dir || !file.name.endsWith('.json')) continue;
            files.push({ url: `${dirUrl}${file.name}`, account });
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
                const rows = await getJson(f.url);
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
