import { create } from '@tinycld/core/lib/store'

// The record id each document route's URL key names, as the route read it
// (hooks/useRouteRecordId.ts). A document opens by its number or by its id (lib/record-key.ts),
// so two screens of one record can carry different keys. The readers of the stack and of
// the URL (lib/stack-screens.ts, lib/record-route.ts) compare records by id through this,
// so a link by id finds the screen a number opened, and the other way round.
interface RouteKeyState {
    // By `<screen name>|<key>`, the screen name as the stack names it (`invoices/[id]`).
    ids: Record<string, string>
    remember: (screenName: string, key: string, id: string) => void
}

const slot = (screenName: string, key: string) => `${screenName}|${key}`

export const useRouteKeyStore = create<RouteKeyState>()(set => ({
    ids: {},
    remember: (screenName, key, id) =>
        set(state => {
            const at = slot(screenName, key)
            if (state.ids[at] === id) return state
            return { ids: { ...state.ids, [at]: id } }
        }),
}))

// The same, live: a list that marks the open record re-renders once the route has read
// which id the URL's key names.
export function useRecordIdForKey(screenName: string, key: string): string {
    return useRouteKeyStore(s => s.ids[slot(screenName, key)] ?? key)
}

// The record id a screen's key names: the id the route read for a number, or the key
// itself (an id, or a number no route has read yet).
export function recordIdForKey(screenName: string, key: string): string {
    return useRouteKeyStore.getState().ids[slot(screenName, key)] ?? key
}
