import { createContext, useContext } from 'react'

// The form's guarded leave (it asks first when edits are unsaved). The header's back link
// reads it, so one cancel path serves the link and the Cancel button. Outside a form there
// is nothing to guard and the link leaves directly.
export const EntryLeaveContext = createContext<(() => void) | null>(null)

export function useEntryLeave() {
    return useContext(EntryLeaveContext)
}
