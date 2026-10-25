import type { FieldErrors } from '@tinycld/core/ui/form'

// Field errors render inline; the summary shows only the form-level refusal
export function rootErrorOnly(errors: { root?: { message?: string } }): FieldErrors {
    const message = errors.root?.message
    if (!message) return {}
    return { form: { type: 'server', message } }
}
