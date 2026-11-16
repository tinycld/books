import type { TextInputInstance } from 'react-native'
import { type OutstandingDocument, paymentCellLabel } from '../../lib/outstanding-documents'
import type { OutstandingRow } from '../../lib/payment-allocation'
import { PaymentMoneyField } from './PaymentMoneyField'

interface PaymentCellProps {
    // Which document the row is: the cell's name ("Payment for bill 1003") and test ids.
    doc: OutstandingDocument
    row: OutstandingRow
    // The row's typed payment; '' while the row is at zero.
    value: string
    error: string
    isLast: boolean
    isDisabled: boolean
    inputRef: (node: TextInputInstance | null) => void
    onType: (row: OutstandingRow, text: string) => void
    // Enter (native: the return key): the next row's cell, or Clear payments after the last.
    onNext: (rowId: string) => void
    // The focused row, for ⌥↵.
    onFocusRow: (rowId: string | null) => void
}

// A row's Payment cell: its one Tab stop.
export function PaymentCell({
    doc,
    row,
    value,
    error,
    isLast,
    isDisabled,
    inputRef,
    onType,
    onNext,
    onFocusRow,
}: PaymentCellProps) {
    const prefix = doc.testIdPrefix
    const handleChange = (text: string) => onType(row, text)
    const handleSubmit = () => onNext(row.id)
    const handleFocus = () => onFocusRow(row.id)
    const handleBlur = () => onFocusRow(null)
    return (
        <PaymentMoneyField
            value={value}
            onChangeText={handleChange}
            testID={`${prefix}-row-amount-${row.id}`}
            accessibilityLabel={paymentCellLabel(doc, row.number)}
            error={error}
            errorTestID={`${prefix}-row-error-${row.id}`}
            inputRef={inputRef}
            onSubmitEditing={handleSubmit}
            onFocus={handleFocus}
            onBlur={handleBlur}
            isLast={isLast}
            isDisabled={isDisabled}
        />
    )
}
