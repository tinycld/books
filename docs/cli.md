# Books from the command line

`tinycld books` is the Books part of the `tinycld` command line tool. It reads and changes the lists of the books: the chart of accounts, customers, vendors, products and services, and sales tax agencies, rates and groups.

The commands are made for programs and agents first. Every command prints JSON with `--json`, takes a record as JSON, and ends with an exit code that says what went wrong. [cli-conventions.md](cli-conventions.md) is the contract; this page is the tour.

## Sign in

```
tinycld auth login <host>
```

The sign-in is the tool's own (the device flow of the server). It asks for every scope the server offers; Books offers two:

| Scope | Allows |
|---|---|
| `books:read` | `list`, `show` |
| `books:write` | `add`, `edit`, `activate`, `deactivate`, `delete` |

A token acts as its user. The user's Books access level (Settings, Access) applies to a command as it does in the app: a user with read-only access can list and show, and no more.

## Commands

Each list is a command group with the same commands:

| Group | Records | Collection |
|---|---|---|
| `tinycld books accounts` | the chart of accounts | `books_accounts` |
| `tinycld books customers` | customers and sub-customers | `books_customers` |
| `tinycld books vendors` | vendors | `books_vendors` |
| `tinycld books products` | products, services and bundles | `books_products` |
| `tinycld books bundle-items` | the products inside a bundle | `books_bundle_items` |
| `tinycld books tax-agencies` | sales tax agencies | `books_tax_agencies` |
| `tinycld books tax-rates` | sales tax rates and groups | `books_tax_rates` |

| Command | Does |
|---|---|
| `list` | Lists the records, 200 to a page; `--limit` takes 1 to 500. Flags: `--limit`, `--page`, `--search`, `--inactive`, `--all`, and the filters of the group (`--type`, `--parent`, `--bundle`, `--product`, `--agency`). |
| `show <id>` | Prints one record. |
| `add --input <file>` | Adds the record in the JSON file. `--input -` reads standard input. |
| `edit <id> --input <file>` | Changes the fields the JSON names. Other fields keep their values. `null` clears a field. |
| `deactivate <id>` | Makes the record inactive: hidden from pickers, history kept. |
| `activate <id>` | Makes an inactive record active again. |
| `delete <id>` | Deletes the record. Asks first; `--yes` answers. The server refuses to delete a record that is in use: make it inactive. |

`bundle-items` has no `activate` and `deactivate`, and its `list` has no `--search`, `--inactive` or `--all`: a bundle item has no name, and it is in the bundle or it is not.

Two more commands:

- `tinycld books accounts types` lists the account types with their detail types. An account's `detail_type` must be one of its type's.
- `tinycld books schema` prints, as JSON, every command with its arguments, flags, the JSON Schema of its input and the JSON Schema of its `--json` output. `tinycld books schema accounts add` prints one command.

## Examples

List the bank accounts as JSON:

```
tinycld books accounts list --type bank --json
```

```json
{
    "items": [
        {
            "id": "k3j9x0a7b2c4d6e",
            "name": "Checking",
            "number": "1000",
            "type": "bank",
            "detail_type": "checking",
            "description": "",
            "parent": "",
            "inactive": false,
            "form_1099_box": "",
            "full_name": "Checking",
            "currency": "USD",
            "created": "2026-11-01 10:00:00.000Z",
            "updated": "2026-11-02 10:00:00.000Z"
        }
    ],
    "page": 1,
    "limit": 200,
    "total": 1
}
```

`total` counts the records that match on all pages. Ask for `--page 2` while `page × limit` is below it.

Add an account from standard input:

```
echo '{"name": "Petty Cash", "number": "1020", "type": "bank", "detail_type": "cash_on_hand"}' \
    | tinycld books accounts add --input - --json
```

Add a customer from a file:

```json
{
    "display_name": "Acme Corp",
    "email": "ap@acme.example",
    "terms": "net_30",
    "billing_address": { "line1": "1 Main St", "line2": "", "city": "Springfield", "region": "IL", "postal_code": "62701", "country": "US" }
}
```

An address names all six keys; a part with no value is `""`. `null` is no address.

```
tinycld books customers add --input acme.json
```

Add a product. Money is a whole number of cents: `15000` is 150.00.

```
echo '{"type": "service", "name": "Consulting hour", "price": 15000, "income_account": "<account id>"}' \
    | tinycld books products add --input -
```

Add a tax rate of 8.875%. A rate is in parts per million of the taxable amount:

```
echo '{"type": "rate", "name": "City", "rate_ppm": 88750, "agency": "<agency id>"}' \
    | tinycld books tax-rates add --input -
```

Change one field, and clear another:

```
echo '{"description": "Main account", "number": null}' \
    | tinycld books accounts edit k3j9x0a7b2c4d6e --input -
```

Make a vendor inactive, then delete a product with no question:

```
tinycld books vendors deactivate <id>
tinycld books products delete <id> --yes
```

## When a command fails

A failed command prints `Error: <message>` on standard error and ends with one of these exit codes. With `--json` it also prints one JSON document on standard output. One case prints no JSON: a flag that cannot be parsed (`--limit abc`, `--output xml`, an unknown flag) exits 2 with text only, because the shell answers before Books runs and the output format is not yet known.

| Exit | Name | Meaning |
|---|---|---|
| 0 | `ok` | The command did what was asked. |
| 1 | `failed` | A failure of no other class. |
| 2 | `usage` | The call is wrong: a flag, an argument or the input. Nothing was sent. |
| 3 | `auth` | Not signed in, or the sign-in ended. Run `tinycld auth login <host>`. |
| 4 | `forbidden` | The token has no Books scope for the action. |
| 5 | `not_found` | No record has this id, or the user's access level does not allow the action on it. |
| 6 | `refused` | The server refused the data. The message says why. |
| 7 | `unavailable` | The server did not answer, or is busy. Try again later. |

```
$ echo '{"name": "Checking", "type": "bank", "detail_type": "checking", "number": "1000"}' \
    | tinycld books accounts add --input - --json
{
    "error": {
        "code": "refused",
        "exit": 6,
        "message": "Failed to create record.",
        "status": 400,
        "fields": {
            "number": {
                "code": "validation_not_unique",
                "message": "Value must be unique."
            }
        }
    }
}
Error: server error (HTTP 400): Failed to create record. (number: Value must be unique.)
```

The server's rules are the rules. The tool checks the shape of the input (field names, types, the values of a choice field) before it sends, so a spelling mistake costs no request. Every rule about the books themselves (an account type and its detail types, a group and its rates, what can be deleted) is the server's, and its message is passed on word for word.
