import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import type { FormHostDef } from '@tinycld/core/lib/forms/host'

// Q4: one stored form serves every kind of a record, and each kind draws a definition
// derived from it. The copies are built with `map` and spreads (Hermes has no
// `structuredClone`), so the stored definition is never changed.

/**
 * A copy of `definition` whose built-ins named in `keys` are hidden. A built-in the
 * host marks required is never hidden: `validateDefinitionForHost` refuses that in a
 * stored form, and a hidden required field could never be filled. A custom field and a
 * field an admin hid keep their `hidden`.
 */
export function hideBuiltins(
    definition: FormDefinition,
    keys: readonly string[],
    host: Pick<FormHostDef, 'builtin'>
): FormDefinition {
    const hostRequired = new Set(host.builtin.filter(b => b.required).map(b => b.key))
    return {
        ...definition,
        fields: definition.fields.map(field =>
            field.kind === 'builtin' && keys.includes(field.key) && !hostRequired.has(field.key)
                ? { ...field, hidden: true }
                : field
        ),
    }
}

/** A copy of `definition` whose built-ins named in `keys` are required. */
export function requireBuiltins(
    definition: FormDefinition,
    keys: readonly string[]
): FormDefinition {
    return {
        ...definition,
        fields: definition.fields.map(field =>
            field.kind === 'builtin' && keys.includes(field.key)
                ? { ...field, required: true }
                : field
        ),
    }
}
