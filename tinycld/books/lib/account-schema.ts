import { z } from '@tinycld/core/ui/form'
import { accountTypeDef } from './account-types'

export const accountFormSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, 'Account name is required')
            .max(200, 'Use 200 characters or fewer'),
        number: z
            .string()
            .max(20, 'Use 20 characters or fewer')
            .regex(/^[0-9A-Za-z.-]*$/, 'Use letters, digits, dots and dashes only'),
        type: z.string().min(1, 'Choose an account type'),
        detail_type: z.string().min(1, 'Choose a detail type'),
        isSubAccount: z.boolean(),
        parent: z.string(),
        description: z.string().max(1000, 'Use 1000 characters or fewer'),
    })
    .superRefine((values, ctx) => {
        if (values.type === '' || accountTypeDef(values.type)) return
        ctx.addIssue({ code: 'custom', path: ['type'], message: 'Choose a valid account type' })
    })
    .superRefine((values, ctx) => {
        const detailTypes = accountTypeDef(values.type)?.detailTypes
        if (!detailTypes || values.detail_type === '') return
        if (detailTypes.some(detail => detail.key === values.detail_type)) return
        ctx.addIssue({
            code: 'custom',
            path: ['detail_type'],
            message: 'This detail type does not belong to the account type',
        })
    })
    .superRefine((values, ctx) => {
        if (!values.isSubAccount || values.parent !== '') return
        ctx.addIssue({ code: 'custom', path: ['parent'], message: 'Choose a parent account' })
    })

export type AccountFormValues = z.infer<typeof accountFormSchema>
