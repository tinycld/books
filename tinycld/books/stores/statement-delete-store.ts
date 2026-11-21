import type { useStatementRecord } from '../hooks/useStatementRecord'
import { createRecordFormStore, useDeletingRecord } from './record-form-store'

type StatementRecord = ReturnType<typeof useStatementRecord>

// The statement screen's view while its delete runs: the row and its customer as they were.
export type StatementSnapshot = {
    id: string
    statement: NonNullable<StatementRecord['statement']>
    customer: StatementRecord['customer']
}

// pbtsdb removes the row optimistically, before the server answers. While this names the
// open statement, its screen draws this snapshot, so a refusal (which restores the row)
// finds the screen as it was, and a delete that goes through never shows "not found" first.
export const useStatementDeleteStore = createRecordFormStore<StatementSnapshot>()

export function useDeletingStatement(id: string): StatementSnapshot | undefined {
    return useDeletingRecord(useStatementDeleteStore, id)
}
