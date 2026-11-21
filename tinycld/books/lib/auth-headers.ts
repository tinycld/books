import { pb } from '@tinycld/core/lib/pocketbase'

// The bearer token of the signed-in user, as the Books routes read it (server/pdf_routes.go,
// server/statement_routes.go). A fetch of such a route sends these headers itself: it does not
// go through the PocketBase SDK, which would add them.
export function authHeaders(): Record<string, string> {
    const token = pb.authStore.token
    return token ? { Authorization: `Bearer ${token}` } : {}
}
