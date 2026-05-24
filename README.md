# bankerchief

## Getting started

This app expects data files to be in the `transactions` directory:

1.  Go to your bank's website or app.
2.  Export your transactions as a CSV or JSON file.
3.  Move the file to the `transactions` directory.

You should have a directory structure like this:

```
transactions/
    mybank/
        2021-01.csv
        2021-02.csv
        2021-03.csv
    anotherbank/
        2021-01.json
        2021-02.json
```

Then, bring up the app:

```shell
podman-compose up
```

Then access the app at http://localhost:3000
