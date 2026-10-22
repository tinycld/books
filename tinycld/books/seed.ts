import type PocketBase from 'pocketbase'

// Seed function invoked by core/scripts/seed-db.ts. Receives the authenticated
// `pb` client plus the seeded user, so records can be owned by the user id.
// Return nothing; throw to abort the seed.

interface SeedContext {
    user: { id: string; email: string; name: string }
}

export default async function seed(_pb: PocketBase, _ctx: SeedContext): Promise<void> {
    // Sample books data arrives with the ledger unit.
}
