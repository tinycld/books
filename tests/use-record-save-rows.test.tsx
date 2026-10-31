// @vitest-environment happy-dom
import { type Collection, createCollection, eq } from '@tanstack/db'
import { type Transaction, useLiveQuery } from '@tanstack/react-db'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { columnSchema } from '@tinycld/core/lib/forms/definition'
import type { FormHostDefInput } from '@tinycld/core/lib/forms/host'
import { type TableRowMapper, tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { deriveFormHosts } from '@tinycld/core/lib/packages/derive-form-hosts'
import { z } from '@tinycld/core/ui/form'
import { useFormCreate, useFormEdit } from '@tinycld/core/ui/forms'
import * as expoRouter from 'expo-router'
import type { Provider } from 'react'
import { View } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    type RecordRowsConfig,
    type RecordSaveConfig,
    useRecordSave,
} from '../tinycld/books/hooks/useRecordSave'
import { optionalText, parseColumns } from '../tinycld/books/lib/record-columns'
import { applyPatch } from '../tinycld/books/lib/record-save'
import {
    createTablePlans,
    type TableWriteOps,
    tableWriteSteps,
} from '../tinycld/books/lib/table-writes'
import {
    enteredWrites,
    guardedStore,
    holdWrites,
    liftRefusal,
    messageRefusal,
    refuseNthWrite,
    resetWriteCounts,
    seedBooks,
    seedFormRecords,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// The rows step of useRecordSave: a host table's rows are written after the record, one
// at a time. The collections are the harness's real local-only ones and the form hooks are
// core's; nothing of ours is mocked. The host is fictional, so no package is named.

type ScreenStubValue = {
    pathname: string
    navigation: { isFocused: () => boolean; dispatch: (action: unknown) => void }
}
// Vitest serves expo-router from the app shell's test stub, which adds ScreenStub: the
// screen whose navigation `useNavigation` answers inside it. The real package's types do not
// name it.
const { ScreenStub } = expoRouter as unknown as { ScreenStub: Provider<ScreenStubValue | null> }

// The user still sees the form, so a refusal lands on it (useRecordSave's isPresent).
const FOCUSED: ScreenStubValue = {
    pathname: '/a/test/widgets/widget000000001',
    navigation: { isFocused: () => true, dispatch: () => {} },
}

const PART_COLUMN_INPUT = [
    { key: 'label', label: 'Label', kind: 'text' as const, required: true },
    { key: 'qty', label: 'Qty', kind: 'number' as const, required: true, min: 1 },
]

const WIDGET_HOST: FormHostDefInput = {
    key: 'test:widget',
    label: 'Widget',
    collection: 'widgets',
    formColumn: 'form',
    fieldsColumn: 'fields',
    columns: ['id', 'name', 'form', 'fields'],
    builtin: [
        { key: 'name', label: 'Name', kind: 'text', storage: 'column', required: true },
        {
            key: 'parts',
            label: 'Parts',
            kind: 'table',
            storage: 'rows',
            columns: PART_COLUMN_INPUT,
        },
    ],
}

const host = deriveFormHosts([
    { manifest: { name: 'test', slug: 'test' }, formHosts: [WIDGET_HOST] },
])[0]

const PART_COLUMNS = columnSchema.array().parse(PART_COLUMN_INPUT)

type Widget = {
    id: string
    name: string
    form: string
    fields: Record<string, unknown> | null
    inactive?: boolean
}
type Part = { id: string; widget: string; label: string; qty: number; position: number }

const WIDGET_ID = 'widget000000001'
const P1 = 'part0000000001a'
const P2 = 'part0000000002b'
const WIDGET: Widget = { id: WIDGET_ID, name: 'W', form: '', fields: null }
const PART_1: Part = { id: P1, widget: WIDGET_ID, label: 'Bolt', qty: 2, position: 0 }
const PART_2: Part = { id: P2, widget: WIDGET_ID, label: 'Nut', qty: 5, position: 1 }

// Rows the form adds; the ids are set here so a test can find their writes. Their keys are in
// the order `tableRowsOf` gives a stored row (cells, then id): core's markSaved compares a
// row by its JSON text, and the form takes the live row's key order once the row lands.
const NEW_A: TableRow = { label: 'Spring', qty: 3, id: 'newpart0000001a' }
const NEW_B: TableRow = { label: 'Clip', qty: 4, id: 'newpart0000002b' }
const NEW_C: TableRow = { label: 'Washer', qty: 1, id: 'newpart0000003c' }

const PART_LIMIT = 'A widget holds at most 1 part.'
const LOCKED = 'This widget is locked.'

const MAPPER: TableRowMapper<Part, { label: string; qty: number; position: number }> = {
    toRow: p => ({ label: p.label, qty: p.qty }),
    positionOf: p => p.position,
    toRecord: (row, position) => ({
        label: String(row.label ?? ''),
        qty: Number(row.qty ?? 0),
        position,
    }),
}

const CTX = { today: '2026-10-30', userId: 'u1' }
const CREATE_VALUES = { name: '' }
const NO_CHECKLISTS = {}

const WIDGET_COLUMNS = z.strictObject({ name: optionalText })
type WidgetColumns = z.infer<typeof WIDGET_COLUMNS>

let widgets: ReturnType<typeof guardedStore<Widget>>
let parts: ReturnType<typeof guardedStore<Part>>
// Every record update the save asked for, by id. TanStack DB sends no write for an update
// that changes nothing, so the handler's log alone cannot show a skipped update.
let recordUpdates: string[] = []

function partOps(widgetId: string): TableWriteOps<Transaction> {
    return {
        insert: w =>
            parts.insert({ id: w.row.id, widget: widgetId, ...MAPPER.toRecord(w.row, w.position) }),
        update: w =>
            parts.update(w.row.id, d => {
                Object.assign(d, MAPPER.toRecord(w.row, w.position))
            }),
        remove: id => parts.delete(id),
    }
}

function rowsConfig(onPartialCreate: RecordRowsConfig['onPartialCreate']): RecordRowsConfig {
    return {
        createPlans: tables => createTablePlans(tables, { parts: PART_COLUMNS }),
        writes: (id, plans) =>
            tableWriteSteps(plans.parts, partOps(id)).map(step => ({
                label: step.itemNumber === null ? null : `Part ${step.itemNumber}`,
                run: step.run,
            })),
        onPartialCreate,
    }
}

function widgetConfig(rows: RecordRowsConfig): RecordSaveConfig<WidgetColumns> {
    return {
        columnsFrom: columns => parseColumns(WIDGET_COLUMNS, columns),
        emptyColumns: { name: '', inactive: false },
        insert: row => widgets.insert(row),
        update: (id, patch, fields) => {
            recordUpdates.push(id)
            return widgets.update(id, draft => applyPatch(draft, patch, fields))
        },
        logContext: 'test.widgets',
        notSavedTitle: 'The widget was not saved.',
        clientSaveFailed: 'Could not save this widget.',
        rows,
    }
}

type Seen = {
    create: ReturnType<typeof useFormCreate>
    edit: ReturnType<typeof useFormEdit>
    saver: ReturnType<typeof useRecordSave>
}

type PartsSource = Collection<Part, string | number>

type ProbeProps = {
    mode: 'new' | 'edit'
    partsSource: PartsSource
    rows: RecordRowsConfig
    leave: () => void
    seen: { current: Seen | null }
}

// The open widget's form as a screen builds it: both core form hooks, the parts read by
// the screen's own live query (passed to the edit form only once it has loaded, so core
// plans against the rows that landed), and the save.
function Probe({ mode, partsSource, rows, leave, seen }: ProbeProps) {
    const create = useFormCreate(host, undefined, CTX, CREATE_VALUES)
    const live = useLiveQuery({
        queryKey: ['test.widget-parts', partsSource.id],
        query: q => q.from({ part: partsSource }).where(({ part }) => eq(part.widget, WIDGET_ID)),
    })
    const tables = live.isReady ? { parts: tableRowsOf(live.data ?? [], MAPPER) } : undefined
    const edit = useFormEdit(host, WIDGET, CTX, NO_CHECKLISTS, tables)
    const recordId = mode === 'edit' ? WIDGET_ID : ''
    const saver = useRecordSave(widgetConfig(rows), { mode, create, edit, recordId, leave })
    seen.current = { create, edit, saver }
    return <View ref={saver.surfaceRef} />
}

function renderProbe(mode: 'new' | 'edit', partsSource: PartsSource = parts) {
    const seen: { current: Seen | null } = { current: null }
    const leave = vi.fn()
    const onPartialCreate = vi.fn()
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        <QueryClientProvider client={client}>
            <ScreenStub value={FOCUSED}>
                <Probe
                    mode={mode}
                    partsSource={partsSource}
                    rows={rowsConfig(onPartialCreate)}
                    leave={leave}
                    seen={seen}
                />
            </ScreenStub>
        </QueryClientProvider>
    )
    const current = () => {
        if (!seen.current) throw new Error('the probe has not rendered')
        return seen.current
    }
    return { current, leave, onPartialCreate }
}

// A parts collection whose read never finishes, so the screen's parts query stays not ready.
function partsNeverLoad(): PartsSource {
    return createCollection<Part, string | number>({
        id: 'widget-parts-never-ready',
        getKey: p => p.id,
        sync: { sync: () => {} },
    })
}

async function openNew() {
    const probe = renderProbe('new')
    await waitFor(() => {
        expect(probe.current().create.formId).toBe('form_1')
        expect(probe.current().create.form.getValues('parts')).toEqual([])
    })
    return probe
}

async function openEdit() {
    const probe = renderProbe('edit')
    await waitFor(() => {
        expect(probe.current().edit.definition).toBeDefined()
        expect(probe.current().edit.form.getValues('parts')).toHaveLength(2)
    })
    return probe
}

// The stored widget's parts as the edit form shows them, in position order: Bolt then Nut.
function storedRows(): TableRow[] {
    return tableRowsOf(
        parts.toArray.filter(p => p.widget === WIDGET_ID),
        MAPPER
    )
}

// The form's root error as the form holds it now. Not `formState.errors`: that is the last
// render's snapshot, and a form whose errors no render read is not re-rendered by setError.
function rootError(form: Seen['edit']['form']) {
    return form.getFieldState('root').error?.message
}

function storedPart(id: string) {
    return parts.toArray.find(p => p.id === id)
}

function createdWidgetId() {
    const created = widgets.toArray.filter(w => w.id !== WIDGET_ID)
    if (created.length !== 1) throw new Error(`expected one new widget, found ${created.length}`)
    return created[0].id
}

async function press(probe: { current: () => Seen }) {
    await act(async () => {
        await probe.current().saver.save()
    })
}

function typeCreate(probe: { current: () => Seen }, name: string, rows: TableRow[]) {
    act(() => {
        probe.current().create.form.setValue('name', name, { shouldDirty: true })
        probe.current().create.form.setValue('parts', rows, { shouldDirty: true })
    })
}

function typeEdit(probe: { current: () => Seen }, key: string, value: unknown) {
    act(() => {
        probe.current().edit.form.setValue(key, value, { shouldDirty: true })
    })
}

beforeEach(() => {
    seedBooks()
    seedFormRecords([WIDGET_HOST])
    widgets = guardedStore<Widget>('widgets', [{ ...WIDGET }])
    parts = guardedStore<Part>('widget_parts', [{ ...PART_1 }, { ...PART_2 }])
    recordUpdates = []
})

describe('useRecordSave rows step: create', () => {
    it('(a) inserts the record, then each row in row order, naming the record', async () => {
        const probe = await openNew()
        typeCreate(probe, 'W2', [NEW_A, NEW_B])

        await press(probe)
        await waitFor(() => expect(probe.leave).toHaveBeenCalledTimes(1))

        const widgetId = createdWidgetId()
        expect(enteredWrites()).toEqual([widgetId, NEW_A.id, NEW_B.id])
        expect(storedPart(NEW_A.id)).toMatchObject({
            widget: widgetId,
            label: 'Spring',
            qty: 3,
            position: 0,
        })
        expect(storedPart(NEW_B.id)).toMatchObject({
            widget: widgetId,
            label: 'Clip',
            qty: 4,
            position: 1,
        })
    })

    it('(b) keeps the record when a row after it is refused, resets the form and hands the refusal to onPartialCreate', async () => {
        const probe = await openNew()
        typeCreate(probe, 'W2', [NEW_A, NEW_B])
        refuseNthWrite(3, messageRefusal(PART_LIMIT))

        await press(probe)
        await waitFor(() => expect(probe.onPartialCreate).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(probe.current().saver.isSaving).toBe(false))

        const widgetId = createdWidgetId()
        expect(probe.onPartialCreate).toHaveBeenCalledWith(
            widgetId,
            expect.objectContaining({ message: PART_LIMIT })
        )
        expect(widgets.has(widgetId)).toBe(true)
        expect(parts.toArray.filter(p => p.widget === widgetId).map(p => p.id)).toEqual([NEW_A.id])
        expect(probe.current().create.form.getValues('name')).toBe('')
        expect(rootError(probe.current().create.form)).toBeUndefined()
        expect(probe.leave).not.toHaveBeenCalled()
    })

    it('(c) writes no row and calls no onPartialCreate when the record insert is refused', async () => {
        const probe = await openNew()
        typeCreate(probe, 'W2', [NEW_A, NEW_B])
        refuseNthWrite(1, messageRefusal(LOCKED))

        await press(probe)
        await waitFor(() => expect(rootError(probe.current().create.form)).toBe(LOCKED))
        await waitFor(() => expect(probe.current().saver.isSaving).toBe(false))

        expect(probe.onPartialCreate).not.toHaveBeenCalled()
        expect(enteredWrites()).toHaveLength(1)
        expect(probe.current().create.form.getValues('name')).toBe('W2')
    })

    it('(c2) saves a record with an empty table as the record alone', async () => {
        const probe = await openNew()
        typeCreate(probe, 'W3', [])

        await press(probe)
        await waitFor(() => expect(probe.leave).toHaveBeenCalledTimes(1))

        expect(enteredWrites()).toEqual([createdWidgetId()])
    })
})

describe('useRecordSave rows step: edit', () => {
    it('(d) skips the record update when only the rows changed', async () => {
        const probe = await openEdit()
        const [bolt, nut] = storedRows()
        typeEdit(probe, 'parts', [nut, bolt])

        await press(probe)
        await waitFor(() => expect(probe.leave).toHaveBeenCalledTimes(1))

        expect(recordUpdates).toEqual([])
        expect([...enteredWrites()].sort()).toEqual([P1, P2])
        expect(storedPart(P1)?.position).toBe(1)
        expect(storedPart(P2)?.position).toBe(0)
    })

    it('(e) removes, then updates, then inserts, and marks the table saved after every write landed', async () => {
        const probe = await openEdit()
        const [, nut] = storedRows()
        typeEdit(probe, 'parts', [{ ...nut, qty: 7 }, NEW_C])

        await press(probe)
        await waitFor(() => expect(probe.leave).toHaveBeenCalledTimes(1))

        expect(enteredWrites()).toEqual([P1, P2, NEW_C.id])
        expect(storedPart(P1)).toBeUndefined()
        expect(storedPart(P2)).toMatchObject({ qty: 7, position: 0 })
        expect(storedPart(String(NEW_C.id))).toMatchObject({
            widget: WIDGET_ID,
            label: 'Washer',
            position: 1,
        })
        expect(probe.current().edit.form.getFieldState('parts').isDirty).toBe(false)
    })

    it('(f) writes the record before its rows when the name and a row changed', async () => {
        const probe = await openEdit()
        const [bolt, nut] = storedRows()
        typeEdit(probe, 'name', 'W renamed')
        typeEdit(probe, 'parts', [bolt, { ...nut, qty: 9 }])

        await press(probe)
        await waitFor(() => expect(probe.leave).toHaveBeenCalledTimes(1))

        expect(recordUpdates).toEqual([WIDGET_ID])
        expect(enteredWrites()).toEqual([WIDGET_ID, P2])
        expect(widgets.get(WIDGET_ID)?.name).toBe('W renamed')
        expect(storedPart(P2)?.qty).toBe(9)
    })

    it('(g) stops at a refused row, shows it on the root as "Part <n>", and a second save writes only what is left', async () => {
        const probe = await openEdit()
        const [bolt, nut] = storedRows()
        typeEdit(probe, 'parts', [{ ...bolt, qty: 3 }, { ...nut, qty: 6 }, NEW_C])
        refuseNthWrite(2, messageRefusal(PART_LIMIT))

        await press(probe)
        await waitFor(() =>
            expect(rootError(probe.current().edit.form)).toBe(`Part 2: ${PART_LIMIT}`)
        )
        await waitFor(() => expect(probe.current().saver.isSaving).toBe(false))

        expect(enteredWrites()).toEqual([P1, P2])
        expect(storedPart(P1)?.qty).toBe(3)
        expect(storedPart(P2)?.qty).toBe(5)
        expect(storedPart(String(NEW_C.id))).toBeUndefined()
        expect(probe.current().edit.form.getFieldState('parts').isDirty).toBe(true)
        expect(probe.leave).not.toHaveBeenCalled()

        liftRefusal()
        resetWriteCounts()
        await press(probe)
        await waitFor(() => expect(probe.leave).toHaveBeenCalledTimes(1))

        expect(enteredWrites()).toEqual([P2, NEW_C.id])
        expect(storedPart(P2)?.qty).toBe(6)
        expect(storedPart(String(NEW_C.id))).toMatchObject({ widget: WIDGET_ID, position: 2 })
        expect(rootError(probe.current().edit.form)).toBeUndefined()
    })

    it('(h) takes one press at a time while the rows step runs', async () => {
        const probe = await openEdit()
        const [bolt, nut] = storedRows()
        typeEdit(probe, 'parts', [nut, bolt])
        const release = holdWrites()

        await press(probe)
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        await press(probe)
        release()
        await waitFor(() => expect(probe.leave).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(probe.current().saver.isSaving).toBe(false))

        expect([...enteredWrites()].sort()).toEqual([P1, P2])
    })

    it('(i) keeps the typed name and rows after a refused row', async () => {
        const probe = await openEdit()
        const [bolt, nut] = storedRows()
        const typedRows = [
            { ...bolt, qty: 3 },
            { ...nut, qty: 6 },
        ]
        typeEdit(probe, 'name', 'W typed')
        typeEdit(probe, 'parts', typedRows)
        refuseNthWrite(2, messageRefusal(PART_LIMIT))

        await press(probe)
        await waitFor(() =>
            expect(rootError(probe.current().edit.form)).toBe(`Part 1: ${PART_LIMIT}`)
        )
        await waitFor(() => expect(probe.current().saver.isSaving).toBe(false))

        expect(enteredWrites()).toEqual([WIDGET_ID, P1])
        expect(storedPart(P1)?.qty).toBe(2)
        expect(probe.current().edit.form.getValues('name')).toBe('W typed')
        expect(probe.current().edit.form.getValues('parts')).toEqual(typedRows)
        expect(probe.current().edit.form.getFieldState('parts').isDirty).toBe(true)
    })

    it('(j) writes only the record when saved before the rows load, never planning stored rows as new', async () => {
        const probe = renderProbe('edit', partsNeverLoad())
        await waitFor(() => expect(probe.current().edit.definition).toBeDefined())
        expect(probe.current().edit.form.getValues('parts')).toBeUndefined()
        typeEdit(probe, 'name', 'W renamed')

        await press(probe)
        await waitFor(() => expect(probe.leave).toHaveBeenCalledTimes(1))

        expect(enteredWrites()).toEqual([WIDGET_ID])
        expect(storedRows()).toEqual([
            { id: P1, label: 'Bolt', qty: 2 },
            { id: P2, label: 'Nut', qty: 5 },
        ])
    })
})
