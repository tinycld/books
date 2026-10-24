import { useState } from 'react'

// Selecting a parent selects only that parent: a batch acts on exactly the
// rows the user ticked.
export function useAccountSelection() {
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
    const toggle = (id: string) => {
        setSelectedIds(current => {
            const next = new Set(current)
            if (!next.delete(id)) next.add(id)
            return next
        })
    }
    return {
        selectedIds,
        isSelected: (id: string) => selectedIds.has(id),
        toggle,
        drop: (ids: readonly string[]) =>
            setSelectedIds(current => new Set([...current].filter(id => !ids.includes(id)))),
        clear: () => setSelectedIds(new Set()),
    }
}
