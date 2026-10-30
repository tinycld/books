import type { VendorRecord } from '../hooks/useVendorsQuery'
import { createRecordFormStore } from './record-form-store'

export const useVendorFormStore = createRecordFormStore<VendorRecord>()
