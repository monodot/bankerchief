// app.js — entry point
// Discovers transaction files under /data/, fetches them, and feeds the
// <transaction-list> component.

import './components/transaction-list.js';

const DATA_BASE = '/data/';

/** Fetch JSON from a URL, always requesting application/json. */
async function getJson(url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

/**
 * Walk /data/ and return every .json file as:
 *   { url, account, filename }
 *
 * Layout expected:
 *   /data/
 *     <account>/          ← directory per bank/account
 *       <name>.json       ← one file per statement period
 */
async function discoverFiles() {
    const topLevel = await getJson(DATA_BASE);
    const files = [];

    for (const entry of topLevel) {
        if (!entry.is_dir) continue;

        const account = entry.name.replace(/\/$/, '');   // strip trailing slash
        const dirUrl  = `${DATA_BASE}${entry.name}`;
        const contents = await getJson(dirUrl);

        for (const file of contents) {
            if (file.is_dir || !file.name.endsWith('.json')) continue;
            files.push({
                url:      `${dirUrl}${file.name}`,
                account,
                filename: file.name,
            });
        }
    }

    return files;
}

const list       = document.getElementById('txn-list');
const rangeEl    = document.getElementById('txn-range');
const refreshBtn = document.getElementById('refresh-btn');

async function loadData() {
    list.loading = true;
    rangeEl.textContent = '';
    refreshBtn.setAttribute('aria-busy', 'true');
    refreshBtn.disabled = true;

    try {
        const files = await discoverFiles();

        if (files.length === 0) {
            list.data = [];
            return;
        }

        // Fetch all files in parallel
        const results = await Promise.all(
            files.map(async f => {
                const rows = await getJson(f.url);
                return rows.map(t => ({ ...t, account: f.account }));
            })
        );

        // Flatten and sort newest-first
        const all = results.flat().sort((a, b) => b.date.localeCompare(a.date));

        list.data = all;

        // Update heading with date range
        if (all.length > 0) {
            const fmtMonth = iso => new Date(iso + 'T00:00:00')
                .toLocaleString('en-GB', { month: 'short', year: 'numeric' });
            const oldest = fmtMonth(all[all.length - 1].date);
            const newest = fmtMonth(all[0].date);
            rangeEl.textContent = oldest === newest ? oldest : `${oldest} – ${newest}`;
        }
    } catch (err) {
        console.error(err);
        list.error = err.message;
    } finally {
        refreshBtn.removeAttribute('aria-busy');
        refreshBtn.disabled = false;
    }
}

refreshBtn.addEventListener('click', loadData);

loadData();
