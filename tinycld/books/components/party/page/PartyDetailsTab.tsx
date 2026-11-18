import { useMemo } from 'react'
import type { PartyPageState } from '../../../hooks/usePartyPage'
import type { DetailSurface } from '../../../lib/detail-surface'
import { hideBuiltins } from '../../../lib/form-definition'
import { RecordFormBody } from '../../RecordChild'
import { RecordLoadingBody } from '../../RecordSurface'

interface PartyDetailsTabProps {
    details: PartyPageState['details']
    surface: DetailSurface
    rowClassName: string
    testIdPrefix: string
}

// The notes live in the Notes tab only, so the Details form never draws them.
const HIDDEN_ON_DETAILS = ['notes'] as const

/**
 * The party's form, edited in place: live inputs for a writer, the same form read-only
 * for a reader. Its state lives in the page, so leaving the tab keeps the edits.
 */
export function PartyDetailsTab({
    details,
    surface,
    rowClassName,
    testIdPrefix,
}: PartyDetailsTabProps) {
    const { isReady, definition, host } = details
    const shown = useMemo(
        () => (definition ? hideBuiltins(definition, HIDDEN_ON_DETAILS, host) : undefined),
        [definition, host]
    )
    if (!isReady || !shown) return <RecordLoadingBody testIdPrefix={testIdPrefix} />
    return (
        <RecordFormBody
            state={details}
            definition={shown}
            surface={surface}
            testIdPrefix={testIdPrefix}
            rowClassName={rowClassName}
        />
    )
}
