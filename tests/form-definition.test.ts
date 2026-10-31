import { definitionSchema, type FormDefinition } from '@tinycld/core/lib/forms/definition'
import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import { hideBuiltins, requireBuiltins } from '../tinycld/books/lib/form-definition'

// A fictional host, so the rules are proved apart from any Books record kind.
const host = hostDefSchema.parse({
    key: 'test:gadget',
    label: 'Gadget',
    collection: 'gadgets',
    formColumn: 'form',
    fieldsColumn: 'fields',
    columns: ['id', 'title', 'price', 'note', 'form', 'fields'],
    builtin: [
        { key: 'title', label: 'Title', kind: 'text', storage: 'column', required: true },
        { key: 'price', label: 'Price', kind: 'number', storage: 'column', required: false },
        { key: 'note', label: 'Note', kind: 'textarea', storage: 'column', required: false },
    ],
})

// The default definition plus a custom `color` field, a rule and a default, so the
// pages, rules and defaults a copy must keep are not empty.
function gadgetDefinition(): FormDefinition {
    const base = defaultDefinitionFor(host)
    return definitionSchema.parse({
        ...base,
        fields: [...base.fields, { key: 'color', kind: 'text', label: 'Color', page: 'main' }],
        rules: [
            {
                key: 'show_note',
                when: [{ field: 'color', op: 'not_empty' }],
                actions: [{ action: 'show', field: 'note' }],
            },
        ],
        defaults: { note: 'hello' },
    })
}

function fieldOf(definition: FormDefinition, key: string) {
    const field = definition.fields.find(f => f.key === key)
    if (!field) throw new Error(`no field ${key}`)
    return field
}

const hiddenOf = (definition: FormDefinition) =>
    Object.fromEntries(definition.fields.map(f => [f.key, f.hidden]))

const requiredOf = (definition: FormDefinition) =>
    Object.fromEntries(definition.fields.map(f => [f.key, f.required]))

describe('hideBuiltins', () => {
    it('hides a named built-in, keeps a host-required one visible and leaves a custom field as it was', () => {
        const definition = gadgetDefinition()
        const color = fieldOf(definition, 'color')
        const result = hideBuiltins(definition, ['price', 'title', 'color'], host)
        expect(hiddenOf(result)).toEqual({ title: false, price: true, note: false, color: false })
        expect(fieldOf(result, 'color')).toEqual(color)
    })

    it('keeps a built-in an admin hid hidden', () => {
        const base = gadgetDefinition()
        const definition = {
            ...base,
            fields: base.fields.map(f => (f.key === 'note' ? { ...f, hidden: true } : f)),
        }
        const result = hideBuiltins(definition, ['price'], host)
        expect(hiddenOf(result)).toEqual({ title: false, price: true, note: true, color: false })
    })

    it('does not change the definition it is given', () => {
        const definition = gadgetDefinition()
        const before = JSON.parse(JSON.stringify(definition))
        hideBuiltins(definition, ['price', 'note'], host)
        expect(definition).toEqual(before)
    })

    it('keeps the pages, rules and defaults', () => {
        const definition = gadgetDefinition()
        const result = hideBuiltins(definition, ['price'], host)
        expect(result.pages).toEqual(definition.pages)
        expect(result.rules).toEqual(definition.rules)
        expect(result.defaults).toEqual(definition.defaults)
    })
})

describe('requireBuiltins', () => {
    it('marks only the named built-in required', () => {
        const result = requireBuiltins(gadgetDefinition(), ['note'])
        expect(requiredOf(result)).toEqual({
            title: true,
            price: false,
            note: true,
            color: false,
        })
    })

    it('leaves a custom field named in the keys as it was', () => {
        const definition = gadgetDefinition()
        const result = requireBuiltins(definition, ['color'])
        expect(fieldOf(result, 'color')).toEqual(fieldOf(definition, 'color'))
    })

    it('does not change the definition it is given', () => {
        const definition = gadgetDefinition()
        const before = JSON.parse(JSON.stringify(definition))
        requireBuiltins(definition, ['note', 'price'])
        expect(definition).toEqual(before)
    })

    it('keeps the pages, rules and defaults', () => {
        const definition = gadgetDefinition()
        const result = requireBuiltins(definition, ['note'])
        expect(result.pages).toEqual(definition.pages)
        expect(result.rules).toEqual(definition.rules)
        expect(result.defaults).toEqual(definition.defaults)
    })
})
