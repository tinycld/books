import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useOpenRecord } from '../../hooks/useRecordNavigation'
import { listLayoutFor } from '../../lib/detail-surface'
import { RECORD_DETAIL_SCREENS } from '../../lib/record-route'
import { salesTabOf } from '../../lib/sales-lists'
import { ListDetailLayout } from '../ListDetailLayout'
import { DocumentListScreen } from './DocumentListScreen'
import { KindStackContext, useKindStackValue } from './kind-stack-context'

/**
 * A sales kind's route — `/a/books/invoices` and the other kinds — and its documents open
 * over or beside it (spec docs/specs/sales-lists-design.md §2, §3 "Opening a document").
 *
 * The kind's list renders here, once, so its rows, scroll position and search stay while
 * documents open and close in the child stack. The open document is read from the URL.
 * On a very wide window every document, `new` too, takes the rest of the row beside a
 * 320 px column of the list. The layout is a screen of the Books root stack, so it reads
 * the screen below it there and hands it to the child stack's screens (KindStackContext).
 */
export function SalesKindLayout({ tabKey }: { tabKey: string }) {
    const tab = salesTabOf(tabKey)
    const { open, openId } = useOpenRecord(tab.path)
    const surface = useDetailSurface()
    const isDetailOpen = open.kind !== 'none'
    const layout = listLayoutFor(surface, 'record', isDetailOpen)
    const kindStack = useKindStackValue(tab.path.replace(/^books\//, ''))
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
                detailScreens={RECORD_DETAIL_SCREENS}
                detailWidth="record"
            />
        </KindStackContext.Provider>
    )
}
