# bankerchief: Simple income and expense visualisation

Bankerchief is a simple web app to track your income and expenditure. It's designed to be run on a computer in your home network and accessed via a VPN like Tailscale. You can optionally also install it as a PWA on your mobile device.

> [!CAUTION]
> The architecture of this app allows anyone who can reach the app to see your transaction history. Please use it at your own risk. Do not run it in the cloud without setting up proper authentication.

## What you need

**Assumptions:** Bankerchief makes the following assumptions (sorry, this is just how I work!):

- You pay off your credit card, in full, every month
- You upload statements from your current (checking) account **and** from all credit cards you send payments to

What you'll need:

- Data files from the bank/current account(s) you want to track
- Data files from all credit cards which you send payments to from the above accounts
- A rules file to categorise transactions (see below for the syntax)

**Why do I need to add credit card statements?** You will need to add this information so that you can categorise spending on your credit cards. Without this information, your credit card spending will just appear as a single outflow from your current account.

## Getting started

This app expects data files to be in the `transactions` directory:

1.  Go to your bank's website or app.
2.  Export your transactions as a CSV or JSON file.
3.  Move the file to the `transactions` directory.

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

Then, bring up the app:

```shell
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
