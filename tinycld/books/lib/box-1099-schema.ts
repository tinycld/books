import { z } from '@tinycld/core/ui/form'
import { BOX_1099_KEYS } from './form-1099'

// The box select's form schema. It lives apart from form-1099.ts, which the seed loads in
// plain node and so takes no runtime import.
export const box1099ValueSchema = z.object({ box: z.enum(BOX_1099_KEYS).or(z.literal('')) })
