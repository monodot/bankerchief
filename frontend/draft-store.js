// draft-store.js — shared draft-rules store (single source of truth).
//
// Both <transaction-list> and <home-view> tag transactions through this one
// instance, so a tag made on any surface is reflected everywhere. State is
// persisted to localStorage and subscribers are notified on every change.

const KEY = 'banky.ruleDraft';
const clean = s => String(s).replace(/\s+/g, ' ').trim();

class DraftStore {
    #tags = {};      // { "date|description|amount": { date, description, category, scope } }
    #mode = false;
    #subs = new Set();

    constructor() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
            this.#tags = saved.tags || {};
            this.#mode = Boolean(saved.mode);
        } catch {
            this.#tags = {};
            this.#mode = false;
        }
    }

    /** Stable identity for a transaction (also carries enough to build a rule). */
    key(t) {
        return `${t.date}|${t.description}|${t.amount}`;
    }

    get mode()  { return this.#mode; }
    get count() { return Object.keys(this.#tags).length; }

    tag(key) { return this.#tags[key]; }

    setMode(on) {
        this.#mode = Boolean(on);
        this.#save();
    }

    apply(t, category, scope = 'date') {
        this.#tags[this.key(t)] = { date: t.date, description: clean(t.description), category, scope };
        this.#save();
    }

    remove(key) {
        delete this.#tags[key];
        this.#save();
    }

    clear() {
        this.#tags = {};
        this.#save();
    }

    /** Rules array; date-scoped first so they win first-match-wins. `all` deduped. */
    generate() {
        const dated = [], all = [], seen = new Set();
        for (const { date, description, category, scope } of Object.values(this.#tags)) {
            if (scope === 'all') {
                const k = `${description}|${category}`;
                if (seen.has(k)) continue;
                seen.add(k);
                all.push({ match: description, category });
            } else {
                dated.push({ match: description, category, date });
            }
        }
        return [...dated, ...all];
    }

    /** Subscribe to any change; returns an unsubscribe function. */
    subscribe(fn) {
        this.#subs.add(fn);
        return () => this.#subs.delete(fn);
    }

    #save() {
        localStorage.setItem(KEY, JSON.stringify({ mode: this.#mode, tags: this.#tags }));
        this.#subs.forEach(fn => fn());
    }
}

export const draftStore = new DraftStore();
