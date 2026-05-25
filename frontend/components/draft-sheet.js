/**
 * <draft-sheet> — shared drafting UI, mounted once.
 *
 * Owns the fixed tray (count + Clear + Generate) and the bottom-sheet overlay
 * (category picker + generated-JSON view). Any view tags a transaction by
 * calling:  document.querySelector('draft-sheet').openPicker(txn, categories)
 *
 * All state lives in the shared draftStore; this element just renders it.
 */
import { draftStore } from '../draft-store.js';

class DraftSheet extends HTMLElement {
    #unsub = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = `
            <style>${STYLES}</style>
            <div class="tray-host"></div>
            <div class="overlay" id="overlay"></div>
        `;
        this.#renderTray();
        this.#unsub = draftStore.subscribe(() => this.#renderTray());
    }

    disconnectedCallback() {
        this.#unsub?.();
    }

    // ── Tray ──────────────────────────────────────────────────────────────────

    #renderTray() {
        const host = this.shadowRoot.querySelector('.tray-host');
        if (!draftStore.mode) { host.innerHTML = ''; return; }

        const n = draftStore.count;
        host.innerHTML = `
            <div class="tray">
                <span class="tray-note">✎ Draft — not editing data</span>
                <span class="tray-count">${n} tagged</span>
                <button class="tray-clear" ${n ? '' : 'disabled'}>Clear</button>
                <button class="tray-generate" ${n ? '' : 'disabled'}>Generate</button>
            </div>
        `;
        host.querySelector('.tray-clear')?.addEventListener('click', () => draftStore.clear());
        host.querySelector('.tray-generate')?.addEventListener('click', () => this.#openGenerate());
    }

    // ── Picker ──────────────────────────────────────────────────────────────────

    /** Open the category picker for a transaction. */
    openPicker(txn, categories = []) {
        const key   = draftStore.key(txn);
        const tag   = draftStore.tag(key);
        const scope = tag?.scope || 'date';
        const label = esc(clean(txn.description));
        const chips = categories.map(c =>
            `<button class="chip ${tag?.category === c ? 'sel' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`
        ).join('');

        const overlay = this.shadowRoot.getElementById('overlay');
        overlay.innerHTML = `
            <div class="sheet-backdrop"></div>
            <div class="sheet" role="dialog" aria-modal="true">
                <p class="sheet-title">${label}</p>
                <p class="sheet-sub">${fmtDate(txn.date)} · ${txn.amount >= 0 ? '+' : '−'}${fmtMoney(Math.abs(txn.amount))}</p>

                <p class="sheet-label">Apply to</p>
                <div class="scope">
                    <label><input type="radio" name="scope" value="date" ${scope === 'date' ? 'checked' : ''}> just for this date</label>
                    <label><input type="radio" name="scope" value="all" ${scope === 'all' ? 'checked' : ''}> all “${label}”</label>
                </div>

                <p class="sheet-label">Existing</p>
                <div class="chips">${chips || '<span class="sheet-empty">none yet</span>'}</div>

                <p class="sheet-label">New category</p>
                <div class="new-cat">
                    <input type="text" id="new-cat-input" placeholder="e.g. Italy 2025" autocomplete="off">
                    <button id="new-cat-add">Add</button>
                </div>

                ${tag ? `<button class="sheet-remove" id="sheet-remove">Remove tag</button>` : ''}
            </div>
        `;
        overlay.classList.add('open');

        const apply = category => {
            const sc = overlay.querySelector('input[name="scope"]:checked')?.value || 'date';
            draftStore.apply(txn, category, sc);
            this.#closeOverlay();
        };

        overlay.querySelector('.sheet-backdrop').addEventListener('click', () => this.#closeOverlay());
        overlay.querySelectorAll('.chip').forEach(b =>
            b.addEventListener('click', () => apply(b.dataset.cat))
        );
        const add = () => {
            const v = overlay.querySelector('#new-cat-input').value.trim();
            if (v) apply(v);
        };
        overlay.querySelector('#new-cat-add').addEventListener('click', add);
        overlay.querySelector('#new-cat-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') add();
        });
        overlay.querySelector('#sheet-remove')?.addEventListener('click', () => {
            draftStore.remove(key);
            this.#closeOverlay();
        });
    }

    // ── Generate ──────────────────────────────────────────────────────────────

    #openGenerate() {
        const json    = JSON.stringify(draftStore.generate(), null, 2);
        const overlay  = this.shadowRoot.getElementById('overlay');
        overlay.innerHTML = `
            <div class="sheet-backdrop"></div>
            <div class="sheet" role="dialog" aria-modal="true">
                <div class="sheet-head">
                    <p class="sheet-title">Draft rules</p>
                    <button class="copy-btn" id="copy-json">Copy</button>
                </div>
                <pre class="json">${esc(json)}</pre>
                <p class="sheet-hint">Paste into <code>transactions/rules.json</code> → the <code>"rules"</code> array.</p>
            </div>
        `;
        overlay.classList.add('open');
        overlay.querySelector('.sheet-backdrop').addEventListener('click', () => this.#closeOverlay());
        overlay.querySelector('#copy-json').addEventListener('click', async e => {
            try {
                await navigator.clipboard.writeText(json);
                e.target.textContent = 'Copied';
                setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
            } catch {
                e.target.textContent = 'Copy failed';
            }
        });
    }

    #closeOverlay() {
        const overlay = this.shadowRoot.getElementById('overlay');
        overlay.classList.remove('open');
        overlay.innerHTML = '';
    }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

const clean = s => String(s).replace(/\s+/g, ' ').trim();

const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtMoney = n => '£' + n.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const fmtDate = iso => new Date(iso + 'T00:00:00')
    .toLocaleString('en-GB', { day: 'numeric', month: 'short' });

// ── Styles ──────────────────────────────────────────────────────────────────

const STYLES = `
    :host {
        --mono: ui-monospace, Menlo, Monaco, Consolas, monospace;
    }

    /* ── Fixed tray ── */
    .tray {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        max-width: 640px;
        margin: 0 auto;
        z-index: 40;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
        padding: 0.7rem 1.25rem calc(0.7rem + env(safe-area-inset-bottom));
        background: var(--surface);
        border-top: 1px solid var(--border);
        box-shadow: 0 -4px 20px rgba(33,30,27,0.08);
    }
    .tray-note {
        font-family: var(--mono);
        font-size: 0.625rem;
        letter-spacing: 0.04em;
        color: var(--accent);
    }
    .tray-count {
        font-family: var(--mono);
        font-size: 0.625rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
        margin-right: auto;
    }
    .tray-clear, .tray-generate {
        font-family: var(--mono);
        font-size: 0.625rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 5px;
        padding: 0.45rem 0.7rem;
        cursor: pointer;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--muted);
    }
    .tray-clear:hover:not(:disabled) { color: var(--text); }
    .tray-generate {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
    }
    .tray-generate:disabled, .tray-clear:disabled {
        opacity: 0.4;
        cursor: default;
    }

    /* ── Overlay + bottom sheet ── */
    .overlay { display: none; }
    .overlay.open {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 50;
    }
    .sheet-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(33,30,27,0.4);
    }
    .sheet {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        margin: 0 auto;
        max-width: 30rem;
        max-height: 85vh;
        overflow-y: auto;
        background: var(--surface);
        border: 1px solid var(--border);
        border-bottom: none;
        border-radius: 14px 14px 0 0;
        padding: 1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
        box-shadow: 0 -8px 30px rgba(33,30,27,0.18);
        animation: sheet-up 0.18s ease-out;
    }
    @keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

    .sheet-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .sheet-title {
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--text);
        word-break: break-word;
    }
    .sheet-sub {
        font-family: var(--mono);
        font-size: 0.6875rem;
        color: var(--muted);
        margin-top: 0.15rem;
    }
    .sheet-label {
        font-family: var(--mono);
        font-size: 0.5625rem;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--muted);
        margin: 1rem 0 0.45rem;
    }
    .sheet-empty { font-size: 0.75rem; color: var(--muted); }

    .scope {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }
    .scope label {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.8125rem;
        color: var(--text);
    }
    .scope input { accent-color: var(--accent); }

    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }
    .chip {
        font-size: 0.75rem;
        color: var(--text);
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 0.35rem 0.7rem;
        cursor: pointer;
    }
    .chip:hover { border-color: var(--accent); color: var(--accent); }
    .chip.sel {
        background: rgba(15,110,120,0.1);
        border-color: var(--accent);
        color: var(--accent);
    }

    .new-cat { display: flex; gap: 0.5rem; }
    .new-cat input {
        flex: 1;
        min-width: 0;
        font-size: 0.875rem;
        font-family: inherit;
        color: var(--text);
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 0.5rem 0.6rem;
    }
    .new-cat input:focus { outline: none; border-color: var(--accent); }
    .new-cat button {
        font-family: var(--mono);
        font-size: 0.6875rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #fff;
        background: var(--accent);
        border: none;
        border-radius: 6px;
        padding: 0 0.9rem;
        cursor: pointer;
    }

    .sheet-remove {
        display: block;
        width: 100%;
        margin-top: 1.1rem;
        font-family: var(--mono);
        font-size: 0.6875rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--expense);
        background: transparent;
        border: 1px solid rgba(168,69,58,0.35);
        border-radius: 6px;
        padding: 0.5rem;
        cursor: pointer;
    }

    .copy-btn {
        font-family: var(--mono);
        font-size: 0.625rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #fff;
        background: var(--accent);
        border: none;
        border-radius: 5px;
        padding: 0.4rem 0.8rem;
        cursor: pointer;
        flex-shrink: 0;
    }
    .json {
        font-family: var(--mono);
        font-size: 0.75rem;
        line-height: 1.5;
        color: var(--text);
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 0.75rem;
        margin-top: 0.75rem;
        overflow-x: auto;
        white-space: pre;
    }
    .sheet-hint {
        font-size: 0.75rem;
        color: var(--muted);
        margin-top: 0.6rem;
    }
    .sheet-hint code {
        font-family: var(--mono);
        font-size: 0.6875rem;
        background: rgba(58,48,38,0.06);
        padding: 0.05rem 0.25rem;
        border-radius: 3px;
    }
`;

customElements.define('draft-sheet', DraftSheet);
