// Books record types, re-exported from the generated schema (the boards
// pattern). pbSchema.ts is generated from the on-disk migrations on every
// install, so these cannot drift from the database. After editing a
// migration, run `cd ~/tmp/tinycld/books/tinycld && pnpm run packages:generate`;
// a "Property does not exist" error in a file you did not touch means the
// schema is stale, never that a type needs editing.
// The generator imports `BooksSchema` from this module by name.
export type {
    BooksAccess,
    BooksAccountBalances,
    BooksAccounts,
    BooksAdmins,
    BooksCloseOverrides,
    BooksCustomers,
    BooksDocSequences,
    BooksJournalEntries,
    BooksJournalLines,
    BooksSettings,
    BooksVendors,
    Schema as BooksSchema,
} from '@tinycld/core/types/pbSchema'
