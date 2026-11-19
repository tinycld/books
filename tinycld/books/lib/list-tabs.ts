import type { DocumentListTab } from './document-list'
import type { ListArea } from './list-areas'

// The one tab lookup of the list areas, re-exported by list-areas.ts. It is in a module of
// its own, with type imports only, because sales-lists.ts and purchase-lists.ts call it and
// list-areas.ts reads their tabs when it loads: a value import of list-areas.ts from those
// two files would be an import cycle.

// The area's tab with this key; an unknown key gives the area's first tab (its All tab).
export function areaTabOf(area: Pick<ListArea, 'tabs'>, key: string): DocumentListTab {
    return area.tabs.find(tab => tab.key === key) ?? area.tabs[0]
}
