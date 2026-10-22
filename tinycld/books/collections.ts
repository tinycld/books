import type { CoreStores } from '@tinycld/core/lib/pocketbase'
import type { Schema } from '@tinycld/core/types/pbSchema'
import type { createCollection } from 'pbtsdb/core'
import type { BooksSchema } from './types'

// Replace (not intersect) the generated entries for this package's own
// collections — a plain intersection would merge each overlapping entry
// field-wise, letting a generated `any` absorb any typed override.
export type MergedSchema = Omit<Schema, keyof BooksSchema> & BooksSchema

export function registerCollections(
    _newCollection: ReturnType<typeof createCollection<MergedSchema>>,
    _core: CoreStores
) {
    return {}
}
