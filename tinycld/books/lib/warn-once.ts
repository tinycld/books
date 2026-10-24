import { log } from '@tinycld/core/lib/logger'

const warned = new Set<string>()

// Several call sites can see the same bad value (an unknown account type is met by the
// balance math and by the display code); a shared key makes it log once, not once per site.
export function warnOnce(
    key: string,
    context: string,
    message: string,
    extra: Record<string, unknown>
) {
    if (warned.has(key)) return
    warned.add(key)
    log.warn(context, message, extra)
}
