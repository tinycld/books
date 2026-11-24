# Books CLI conventions

The rules every `tinycld books` command follows. A unit that adds a command (transactions, purchase orders, an import) follows them; a caller (a script, an agent) can rely on them. `tinycld books schema` prints the same contract as JSON, and `cli/docs_test.go` holds this page to the code.

## For the caller

1. **`--json` on every command.** With `--json` (or `--output json`) standard output holds exactly one JSON document: the result, or `{"error": …}` when the command failed. Never two documents, never text before or after. Progress text ("added account …") goes to standard error, and `--quiet` removes it.
2. **A record is JSON in, JSON out.** A command that takes a record reads one JSON object from `--input <file>`, or from standard input with `--input -`. There is no flag for each field. The record a command prints has the same field names as the record it takes, and always every field: a field with no value is `""`, `false`, `0`, `[]` or `null`, never left out.
3. **`add` needs the required fields; `edit` changes only what is named.** A field that the `edit` input does not name keeps its value. `null` clears a field. A field the server sets (`id`, `created`, `updated`, and each field `schema` marks `readOnly`) is refused in an input.
4. **Money is a whole number of cents.** `1250` is 12.50. A tax rate is a whole number of parts per million: `88750` is 8.875%. A fraction is refused. Quantities are plain numbers.
5. **An id in a result is the id the other commands take.** A relation field holds the id of the other record (`parent`, `income_account`), or `""`; a multiple relation is an array of ids. An address is an object with all six keys (`line1`, `line2`, `city`, `region`, `postal_code`, `country`), each a string, or `null`.
6. **A list is a page.** `list` prints `{items, page, limit, total}`. `total` counts the records that match on all pages; the default `limit` is 200 and the largest 500. A list leaves inactive records out unless `--inactive` (only those) or `--all` is given.
7. **Exit codes are stable.**

    | Exit | Name | Meaning | Try again? |
    |---|---|---|---|
    | 0 | `ok` | The command did what was asked. | |
    | 1 | `failed` | A failure of no other class. | no |
    | 2 | `usage` | The call is wrong: a flag, an argument or the `--input` document. Nothing was sent. | after a correction |
    | 3 | `auth` | Not signed in, or the sign-in ended. | after `tinycld auth login <host>` |
    | 4 | `forbidden` | The token has no Books scope for the action. | no |
    | 5 | `not_found` | No record has this id, or the user's Books access level does not allow the action on it. | no |
    | 6 | `refused` | The server refused the data. `message` and `fields` say why. | after a change of the input |
    | 7 | `unavailable` | The server did not answer, or is busy. | yes, later |

    Check exit codes with a built binary; `go run` exits 1 for every non-zero exit of the program.

8. **The error document.** `{"error": {"code", "exit", "message", "status", "fields"}}`. `code` is the name in the table and `exit` its number. `message` is the server's own sentence for a refusal. `status` is the HTTP status, when the server answered. `fields` has, for each field the server refused, its `code` and `message`. One case prints no JSON: a flag that cannot be parsed (`--limit abc`, `--output xml`, an unknown flag) exits 2 with text only, because the shell answers before Books runs and the output format is not yet known. A call for help (`--help`, or a group with no command word) prints help text and exits 0.
9. **A mistake is never a success.** An unknown command word (`tinycld books acounts list`) exits 2. A `delete` without `--yes` and without a terminal exits 2 and deletes nothing.
10. **`tinycld books schema` describes every command**: arguments, flags, the JSON Schema of the `--input` document and the JSON Schema of the `--json` result. It prints JSON in every output mode. An input schema allows `null` for a field that `edit` can clear.

The server can refuse what the tool accepted. The tool checks field names, types and choice values; the server checks everything else, and its answer is exit 6 with its message. One refusal has no helpful message: an `add` by a user whose Books access level does not allow it answers `Failed to create record.` with no field (PocketBase does not say which rule failed).

## For the author of a command

1. **A command is an HTTP client.** The module `cli/` imports `tinycld.org/cli/...` and cobra, never the Books server module. It calls the PocketBase record API and the Books routes that the app calls. Do not add a route for the CLI alone: the collection rules and the Go guards are the whole check, and a second path would need a second copy of them.
2. **Build every command with `newCommand`** (`cli/command.go`). It checks the argument count, resolves `--json`, passes each error through `report` (exit code, error document) and stores the schemas `books schema` prints. A command declares `Output`, and `Input` when it reads a record; `TestEveryCommandHasASchema` fails for a command that does not. A command with a variable argument count sets `schemaAnnotations` itself and calls `report`, as `schema` does.
3. **Build a group with `newGroup`**, so an unknown word under it is a usage error.
4. **Return plain errors.** Return the client's error as it is (wrap with `%w` to add the record: `fmt.Errorf("account %s: %w", id, err)`); `report` gives it its class through `exitcode.Classify`. Use `usagef` for a call that is wrong before anything is sent. Never call `os.Exit`, and never print an error yourself.
5. **Read a record with `bindInput` and `readInput`.** They refuse a document that is not one JSON object, that is over 1 MiB, or that names a field twice, and keep numbers as written. Do not add a flag for a field.
6. **Check the input in the tool only for shape.** Field names, types and choice values, from the same definition that `schema` prints. Leave each rule about the books to the server and pass its message on.
7. **A list resource is data.** A new list (one collection, plain fields) is an entry in `cli/resources.json`: no Go code. `server/cli_resources_test.go` fails when an entry and its collection differ, when a collection field is neither declared nor in `omit`, and when the OAuth registration (`server/oauth_scopes.go`) does not give the collection both scopes. A new collection that a command writes needs its OAuth entry first.
8. **A transaction command is code.** A document with lines (an invoice, a bill, a journal entry, a purchase order) does not fit `resources.json`. Write its command with `newCommand`, declare its input and output schemas by hand, keep rule 2 of the caller's list (the printed record has the field names of the input), and print lines as an array `lines` inside the document.
9. **Write to standard output only through `o.Write`** (table, JSON, CSV from one call) and progress text only through `o.Info` on standard error.
10. **Test each command twice.** In `cli/`, against `fakeBooks` (`cli/fakeserver_test.go`): what the command sends, what it prints, each exit code. In `server/`, against the real PocketBase API: that the server accepts what the command sends (`TestCLIResources_*`). The fake runs no rule, so the first test alone proves nothing about access. The server test cannot import the CLI module, so its request bodies are copies of what the command sends: when a command changes a body, change the server test with it. The filter and sort texts of `list` are not copies: they live in `cli/testdata/list-filters.json`, which the server test sends and `cli/list_filters_test.go` holds to `cli/list.go`. When `list` changes what it sends, the cli test fails until the fixture is edited, and the server test then sends the new text.
11. **Document it.** Add the command to [cli.md](cli.md) and to the help topic `help/command-line.md`. `cli/docs_test.go` fails for a group that the pages do not name.
