import { z } from '@tinycld/core/ui/form'

const optionalColumn = z.number().nullable()

// Name and Type may start unmapped, so the form values stay `number | null` like a
// ColumnMap and the refinement is what makes them required.
function requiredColumn(message: string) {
    return optionalColumn.refine(column => column !== null, message)
}

export const columnMapSchema = z.object({
    number: optionalColumn,
    name: requiredColumn('Choose the column for Name'),
    type: requiredColumn('Choose the column for Type'),
    detail_type: optionalColumn,
    parent: optionalColumn,
    description: optionalColumn,
    inactive: optionalColumn,
})
