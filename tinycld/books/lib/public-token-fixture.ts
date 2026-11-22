// A public token is 43 URL-safe characters (estimate public link spec §4.1, email-share
// spec §4.3). The fixture's are readable on purpose; the server makes real ones from a
// random source, and the seed never sends one. A module of its own, so that the invoice
// and the estimate fixtures, which import each other's rows, can both use it.
export function fixtureToken(tag: string): string {
    return `pub_${tag}_`.padEnd(43, '0')
}
