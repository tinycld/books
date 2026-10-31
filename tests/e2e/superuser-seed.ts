import PocketBase from 'pocketbase'

// A PocketBase client signed in as the e2e server's superuser, for the one spec the
// human allowed to seed list rows directly (list-paging.spec.ts; its header says why).
// scripts/e2e-serve.ts creates this superuser from the same variables and defaults.
const PB_URL = `http://127.0.0.1:${process.env.E2E_PORT ?? 7200}`
const SUPERUSER_EMAIL = process.env.ADMIN_USER_LOGIN || 'admin@tinycld.org'
const SUPERUSER_PASSWORD = process.env.ADMIN_USER_PW || 'AdminPass1234!'

export async function superuserClient(): Promise<PocketBase> {
    const pb = new PocketBase(PB_URL)
    pb.autoCancellation(false)
    await pb.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD)
    return pb
}

export type Seeded = { collection: string; id: string }

// Deletes seeded rows newest first, so a sub-customer goes before its parent.
export async function deleteSeeded(pb: PocketBase, seeded: readonly Seeded[]) {
    for (const row of [...seeded].reverse()) {
        await pb.collection(row.collection).delete(row.id)
    }
}

// A word unique to one run, put in every seeded name: a search for it shows only that
// run's rows, whatever other specs add to the shared database meanwhile.
export function runStamp(): string {
    return `pg${Date.now().toString(36)}`
}
