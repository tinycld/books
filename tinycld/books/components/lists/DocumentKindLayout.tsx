import { useRoute } from 'expo-router'
import { useNavigationState } from 'expo-router/react-navigation'
import { useMemo } from 'react'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { listLayoutFor } from '../../lib/detail-surface'
import type { DocumentListTab } from '../../lib/document-list'
import { RECORD_DETAIL_SCREENS } from '../../lib/record-route'
import { type BelowScreen, belowSignature, screensOfSignature } from '../../lib/stack-screens'
import { ListDetailLayout } from '../ListDetailLayout'
import { DocumentListScreen } from './DocumentListScreen'
import { KindStackContext } from './kind-stack-context'

// Every flat screen of the Books root routes below this kind route, for the Back of the
// documents in its child stack: a read view pops past copies of itself below the kind
// route too (popDepth). Read with useNavigationState, not getState(): during a render
// getState() still returns the state before the push that mounted this route. The
// selector returns a string, so the selection is stable between renders.
function useScreensBelow(): readonly BelowScreen[] {
    const { key } = useRoute()
    const signature = useNavigationState(state => belowSignature(state, key))
    return useMemo(() => screensOfSignature(signature), [signature])
}

// The kind's child stack: `[id]`, and `new` when the kind has a `new` screen.
const ID_SCREEN_ONLY = RECORD_DETAIL_SCREENS.filter(name => name !== 'new')

/**
 * A kind tab's route — `/a/books/invoices` and the other kinds — and its documents open
 * over or beside it (the Sales lists design spec §2, §3 "Opening a document").
 *
 * The kind's list renders here, once, so its rows, scroll position and search stay while
 * documents open and close in the child stack. The open document is read from the URL.
 * On a very wide window every document, `new` too, takes the rest of the row beside a
 * 320 px column of the list. The child stack declares `[id]`, and `new` only when
 * `hasNew` is true. The layout is a screen of the Books root stack, so it reads the screen
 * below it there and hands it to the child stack's screens (KindStackContext).
 */
export function DocumentKindLayout({ tab, hasNew }: { tab: DocumentListTab; hasNew: boolean }) {
    const detailScreens = hasNew ? RECORD_DETAIL_SCREENS : ID_SCREEN_ONLY
    const { open, openId } = useOpenRecord(tab.path)
    const surface = useDetailSurface()
    const isDetailOpen = open.kind !== 'none'
    const layout = listLayoutFor(surface, 'record', isDetailOpen)
    const below = useScreensBelow()
    const kindRoute = tab.path.replace(/^books\//, '')
    const kindStack = useMemo(() => ({ kindRoute, below }), [kindRoute, below])
    // Below 1360 px the document is a page pushed over the list, which stays mounted under
    // it; beside the 320 px column the list is in view.
    const isCovered = isDetailOpen && layout !== 'names'
    const list = (
        <DocumentListScreen tab={tab} openId={openId} layout={layout} isCovered={isCovered} />
    )
    return (
        <KindStackContext.Provider value={kindStack}>
            <ListDetailLayout
                list={list}
                isDetailOpen={isDetailOpen}
                detailScreens={detailScreens}
                detailWidth="record"
            />
        </KindStackContext.Provider>
    )
}
