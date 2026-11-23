import { log } from '@tinycld/core/lib/logger'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import * as Clipboard from 'expo-clipboard'
import { documentLinkUrl, type LinkedKind } from '../lib/document-link'

/**
 * Copy customer link of a stored invoice or estimate (spec §3.5): puts its public page's
 * link (documentLinkUrl) on the clipboard and says so in a toast. Offered only while the
 * token is known and writes are available: copying writes nothing, but the link is a
 * writer's action, and an estimate's customer answers through it.
 */
export function useCopyDocumentLink(kind: LinkedKind, token: string) {
    const writes = useWritesAvailable()
    const isOffered = token !== '' && writes.available
    const copy = () => {
        if (token === '') return
        Clipboard.setStringAsync(documentLinkUrl(kind, token))
            .then(() =>
                useToastStore.getState().addToast({
                    title: 'Customer link copied.',
                    variant: 'success',
                    duration: 3000,
                })
            )
            .catch((error: unknown) => {
                log.warn('books.document-link', 'could not copy the customer link', {
                    kind,
                    error,
                })
                useToastStore.getState().addToast({
                    title: 'Could not copy the link.',
                    variant: 'error',
                    duration: 5000,
                })
            })
    }
    return { isOffered, copy }
}
