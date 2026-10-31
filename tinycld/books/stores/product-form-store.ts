import type { ProductRecord } from '../hooks/useProductsQuery'
import { createRecordFormStore } from './record-form-store'

export const useProductFormStore = createRecordFormStore<ProductRecord>()
