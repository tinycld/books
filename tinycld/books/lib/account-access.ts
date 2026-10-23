// Writes stay hidden until the access row has loaded, so a screen never offers
// an action the server would refuse.
export function canWriteAccounts({ canWrite, isReady }: { canWrite: boolean; isReady: boolean }) {
    return canWrite && isReady
}
