## About this app

The architecture is a read-only static app. There's no backend and no database — Caddy serves the bank-export JSON files directly (/data/*), and app.js fetches them in the browser.

- Vanilla Web Components app, no framework, no build step.
- Charts.js for the graphs, loaded from CDN.
- Styles: the theme palette lives in `:root` CSS vars in index.html.

## Principles you should adhere to

- Always write as little code as possible 

## Running locally

To run:

    podman-compose up --build

This mounts `./frontend` to `/srv` inside the container, and `./transactions` to `/data`. Caddy serves the static HTML app, and the data directory as a browsable JSON directory listing which app.js fetches and iterates over to discover accounts and transaction files.
