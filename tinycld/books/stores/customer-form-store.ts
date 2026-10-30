import type { CustomerRecord } from '../hooks/useCustomersQuery'
import { createRecordFormStore } from './record-form-store'

export const useCustomerFormStore = createRecordFormStore<CustomerRecord>()
