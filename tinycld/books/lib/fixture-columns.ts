// Each name must be a key of `Row`, so a fixture type built from it fails to
// compile when one of those columns leaves the schema, instead of leaving a
// stale override or a stale Omit.
export type ColumnOf<Row, Key extends keyof Row> = Key
