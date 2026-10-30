import { z } from '@tinycld/core/ui/form'

// A text column the form may leave out: core `splitValues` drops a key whose value is
// undefined, and an edit patch holds only the dirty keys.
export const optionalText = z.string().optional()

export type ColumnsParse<C> = { success: true; columns: C } | { success: false; error: z.ZodError }

// The built-in columns a record's form wrote, checked against the collection's columns.
export function parseColumns<S extends z.ZodType>(
    schema: S,
    columns: Record<string, unknown>
): ColumnsParse<z.infer<S>> {
    const parsed = schema.safeParse(columns)
    if (!parsed.success) return { success: false, error: parsed.error }
    return { success: true, columns: parsed.data }
}
