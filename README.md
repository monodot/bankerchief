# bankerchief: Simple income and expense visualisation

A read-only view of your bank exports - no import step, no database. Drop files into a folder, reload the page, and get charts and categorised spending reports.

Designed to run on a home server and accessed via a VPN like Tailscale. Can
also be installed as a PWA on mobile.

## How it works

Bankerchief has no backend and no database. It runs entirely in the browser:

- **Caddy** serves the frontend and your transaction files
- Caddy's built-in directory listing exposes your transaction files as a browsable JSON index at `/data`
- The app fetches `/data` to discover accounts, then fetches each account's JSON file to get the transactions
- All parsing, charting, and categorisation happens in the browser

> [!CAUTION]
> The architecture of this app allows anyone who can reach the app can read all of your files. Please use it at your own risk. Do not run it in the cloud without setting up proper authentication.

## What you need

**Assumptions:** Bankerchief makes the following assumptions (sorry, this is just how I work!):

- You pay off your credit card, in full, every month
- You upload statements from your current (checking) account **and** from all credit cards you send payments to

What you'll need:

- [podman](https://podman.io/docs/installation) or [docker](https://www.docker.com/products/docker-desktop/) installed
- Data files from the bank/current account(s) you want to track
- Data files from all credit cards which you send payments to from the above accounts
- A rules file to categorise transactions (see below for the syntax)

**Why do I need to add credit card statements?** You will need to add this information so that you can categorise spending on your credit cards. Without this information, your credit card spending will just appear as a single outflow from your current account.

## Getting started

Bring up the app with sample data:

```shell
docker run --rm --name bankerchief -p 3000:3000 \
  -v "$(pwd)/frontend:/srv" \
  -v "$(pwd)/sampledata:/transactions" \
  -v "$(pwd)/Caddyfile:/etc/caddy/Caddyfile" \
  docker.io/library/caddy:alpine
```

Access the app at `http://localhost:3000`.

### Add your transactions

This app expects a folder of data files to be mounted in the container:

1.  Go to your bank's website or app.
2.  Export your transactions as a CSV or JSON file.
3.  Move the files to the `transactions` directory, one subfolder per bank.

You should have a directory structure like this:

```
transactions/
    rules.json (see below)
    mybank/
        2021-01.csv
        2021-02.csv
        2021-03.csv
        format.json (see below)
    anotherbank/
        2021-01.json
        2021-02.json
```

Then, you can run the app with:

```shell
docker run --rm --name bankerchief -p 3000:3000 \
  -v "$(pwd)/frontend:/srv" \
  -v "/path/to/your/transactions:/transactions" \
  -v "$(pwd)/Caddyfile:/etc/caddy/Caddyfile" \
  docker.io/library/caddy:alpine
```

Alternatively, use the included Compose file:

```shell
docker-compose up
# or:
podman-compose up
```

## Setting up parsing rules

Add an optional `transactions/rules.json` file, to tag transactions by category:

```json
{
  "categories": {
    "Investments": { "isExpense": false },
    "Credit card": { "isExpense": false }
  },
  "rules": [
    { "match": "VANGUARD LONDON",  "category": "Investments" },
    { "match": "AMERICAN EXPRESS", "category": "Credit card" },
    { "match": "TESCO",            "category": "Groceries" }
  ]
}
```

- `match` is a case-insensitive substring of the transaction description
  (whitespace is collapsed, so `VANGUARD LONDON` matches `VANGUARD     LONDON`).
- The first matching rule wins; anything unmatched is `Uncategorised`.
- A category marked `"isExpense": false` is treated as a **transfer**: money
  moving between your own accounts (investments, savings, a credit-card payment)
  rather than spending. Transfers count as neither income nor expense and are
  shown in their own bucket.

> [!TIP]
> You should mark credit-card payments as transfers only if you **also** import the card's own statement every month (see above). Otherwise, excluding them would undercount spending.

## CSV data sources

Files are loaded as JSON by default. To load CSV exports (e.g. credit-card
statements), drop a `format.json` hint into that account's directory describing
how to parse them:

```
transactions/
    amex/
        format.json
        amex-202605.csv
```

```json
{
  "format": "csv",
  "dateFormat": "DD/MM/YYYY",
  "columns": { "date": "Date", "description": "Description", "amount": "Amount" },
  "flipSign": true
}
```

- `columns` maps the canonical fields to your CSV's header names.
- `dateFormat`: use `DD/MM/YYYY` for UK-style dates; otherwise ISO is assumed.
- `flipSign: true` negates amounts — this is required if a card export lists purchases
  as positive. Note this also flips bill *payments* to positive, so add a rule
  (e.g. `PAYMENT RECEIVED` → an `isExpense: false` category) to exclude them.

The hint applies to every data file in that directory. CSV parsing splits on
commas and assumes fields contain no embedded commas.


## Installing as a PWA on iOS

You can install this app as a PWA on your iOS device, so you can access it from
anywhere in your home network or whenever your device is connected to your VPN.

On your mobile device, install **Tailscale** (or configure your own VPN). Then open Safari and go to `http://your-machine-name:3000`.

Click the **Share** button in Safari and click **Add to Home Screen** to install it onto your device.
