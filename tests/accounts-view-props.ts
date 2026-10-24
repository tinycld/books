// Props every account list, toolbar and screen view now requires. Tests spread
// these so no test relies on a component default.
import { vi } from 'vitest'
import type { AccountRow } from '../tinycld/books/hooks/useAccountsQuery'

export function menuHandlers() {
    return {
        onEdit: vi.fn(),
        onViewRegister: vi.fn(),
        onAddSub: vi.fn(),
        onToggleInactive: vi.fn(),
        onDelete: vi.fn(),
    }
}

export function listProps(over: { canWrite?: boolean; isWorking?: boolean } = {}) {
    return {
        canWrite: over.canWrite ?? false,
        isWorking: over.isWorking ?? false,
        isSelected: (_id: string) => false,
        onSelect: vi.fn(),
        menu: menuHandlers(),
    }
}

export function stubActions(over: { isWorking?: boolean; actionError?: string | null } = {}) {
    return {
        // Resolves the way the hook does: the ids it made inactive, plus the id it stopped at.
        setInactive: vi.fn(
            async (ids: string[], _inactive: boolean) =>
                ({
                    done: ids,
                }) as { done: string[]; failed?: string }
        ),
        deleteAccount: vi.fn(async (_id: string) => true),
        isWorking: over.isWorking ?? false,
        actionError: over.actionError ?? null,
        clearActionError: vi.fn(),
    }
}

export function viewProps(
    over: {
        isWorking?: boolean
        actionError?: string | null
        deleteTarget?: AccountRow | null
    } = {}
) {
    const actions = stubActions(over)
    return {
        isTablet: false,
        selection: { isSelected: (_id: string) => false, toggle: vi.fn() },
        selectedCount: 0,
        menu: menuHandlers(),
        makeSelectedInactive: vi.fn(),
        deleteTarget: over.deleteTarget ?? null,
        cancelDelete: vi.fn(),
        actions,
        isWorking: actions.isWorking,
        actionError: actions.actionError,
        clearActionError: actions.clearActionError,
    }
}
