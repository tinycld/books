// The people at a customer or vendor in the Contacts tab's order: the primary contact
// first, then by name, ignoring case and accents. Array sort is stable, so two names that
// compare equal keep their order. Returns a new array; the input is not changed.
export function sortContacts<T extends { is_primary: boolean; name: string }>(
    rows: readonly T[]
): T[] {
    return [...rows].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
}
