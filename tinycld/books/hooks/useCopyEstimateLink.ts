import { log } from '@tinycld/core/lib/logger'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import * as Clipboard from 'expo-clipboard'
import { estimateLinkUrl } from '../lib/estimate-link'

/**
 * Copy customer link of a stored estimate: puts its public page's link on the clipboard
 * and says so in a toast. Offered only while the token is known and writes are
 * available: copying writes nothing, but the link is for a customer to answer, which
 * Books then shows on the estimate.
 */
export function useCopyEstimateLink(token: string) {
    const writes = useWritesAvailable()
    const isOffered = token !== '' && writes.available
    const copy = () => {
        if (token === '') return
        Clipboard.setStringAsync(estimateLinkUrl(token))
            .then(() =>
                useToastStore.getState().addToast({
                    title: 'Customer link copied.',
                    variant: 'success',
                    duration: 3000,
                })
            )
            .catch((error: unknown) => {
                log.warn('books.estimate-link', 'could not copy the customer link', { error })
                useToastStore.getState().addToast({
                    title: 'Could not copy the link.',
                    variant: 'error',
                    duration: 5000,
                })
            })
    }
    return { isOffered, copy }
}
