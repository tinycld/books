import { useMemo } from 'react'
import type { CustomerPageState } from '../../../hooks/useCustomerPage'
import type { DetailSurface } from '../../../lib/detail-surface'
import { hideBuiltins } from '../../../lib/form-definition'
import { RecordFormBody } from '../../RecordChild'
import { RecordLoadingBody } from '../../RecordSurface'

interface CustomerDetailsTabProps {
    details: CustomerPageState['details']
    surface: DetailSurface
    rowClassName: string
}

// The notes live in the Notes tab only, so the Details form never draws them.
const HIDDEN_ON_DETAILS = ['notes'] as const

/**
 * The customer form, edited in place: live inputs for a writer, the same form read-only
 * for a reader. Its state lives in the page, so leaving the tab keeps the edits.
 */
export function CustomerDetailsTab({ details, surface, rowClassName }: CustomerDetailsTabProps) {
    const { isReady, definition, host } = details
    const shown = useMemo(
        () => (definition ? hideBuiltins(definition, HIDDEN_ON_DETAILS, host) : undefined),
        [definition, host]
    )
    if (!isReady || !shown) return <RecordLoadingBody testIdPrefix="customer" />
    return (
        <RecordFormBody
            state={details}
            definition={shown}
            surface={surface}
            testIdPrefix="customer"
            rowClassName={rowClassName}
        />
    )
}
