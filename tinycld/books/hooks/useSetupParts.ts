import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useForm, useWatch, z, zodResolver } from '@tinycld/core/ui/form'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { accountCountLabel } from '../lib/setup-copy'
import { type SetupValues, setupSchema } from '../lib/setup-schema'
import { availableOnly, LIST_ENTRIES, SIDEBAR_ENTRIES } from '../lib/shell-nav'
import { groupStarterChart, type Ownership, starterChart } from '../lib/starter-chart'
import { useBooksAccess } from './useBooksAccess'
import { type SetupOutcome, useBooksSetup } from './useBooksSetup'

// A SelectInput hands the form its option's string, while the stored month is
// a number: the form validates the string and `toSetupValues` converts it once,
// at submit, so the default January and a picked month both arrive as a number.
const monthSchema = setupSchema.shape.fiscal_year_start_month

const setupFormSchema = setupSchema.extend({
    fiscal_year_start_month: z
        .string()
        .refine(value => monthSchema.safeParse(Number(value)).success, 'Choose a month'),
})

type SetupFormValues = z.infer<typeof setupFormSchema>

function toSetupValues(values: SetupFormValues): SetupValues {
    return { ...values, fiscal_year_start_month: Number(values.fiscal_year_start_month) }
}

type Stage = 'business' | 'ownership' | 'chart' | 'creating' | 'done' | 'error'

export type SetupPart = Stage | 'populated' | 'non-admin' | 'loading'

type Failure = { failedAccount: string; message: string }

type ContinueAction = {
    label: string
    onPress: () => void
    isDisabled: boolean
    requiresServer: boolean
}

const POSITION: Partial<Record<SetupPart, number>> = {
    business: 1,
    ownership: 2,
    chart: 3,
    creating: 3,
    error: 3,
    populated: 3,
}

const DEFAULT_OWNERSHIP: Ownership = 'owners'

function useOpeningBalancesEntry() {
    return availableOnly([...SIDEBAR_ENTRIES, ...LIST_ENTRIES]).find(
        entry => entry.id === 'opening-balances'
    )
}

export function useSetupParts(next?: () => void) {
    const setup = useBooksSetup()
    const access = useBooksAccess()
    const orgHref = useOrgHref()
    const openingBalances = useOpeningBalancesEntry()
    // `null` until the person moves: a half-done book then opens on the chart.
    const [moved, setMoved] = useState<Stage | null>(null)
    const [failure, setFailure] = useState<Failure | null>(null)

    const { settings } = setup
    const saved = settings
        ? {
              business_name: settings.business_name,
              fiscal_year_start_month: String(settings.fiscal_year_start_month),
              ownership: setup.ownership || DEFAULT_OWNERSHIP,
          }
        : undefined
    const form = useForm<SetupFormValues>({
        resolver: zodResolver(setupFormSchema),
        defaultValues: {
            business_name: '',
            fiscal_year_start_month: '1',
            ownership: DEFAULT_OWNERSHIP,
        },
        // A half-done book comes back with its saved name; typed fields stay.
        values: saved,
        resetOptions: { keepDirtyValues: true },
    })
    const ownership = useWatch({ control: form.control, name: 'ownership' })
    const errors = form.formState.errors

    const stage: Stage = moved ?? (setup.isResuming ? 'chart' : 'business')
    const part = partOf({
        stage,
        isNonAdmin: access.isReady && !access.isAdmin,
        isLoading: !setup.isReady,
        isCompleted: !!settings?.setup_completed,
        isPopulated: (setup.accountCount ?? 0) > 0 && !setup.isResuming,
        hasFailure: failure !== null,
    })

    const chart = starterChart(ownership)
    const goTo = (target: Stage) => setMoved(target)

    const goNext = async () => {
        if (stage === 'business') {
            const isValid = await form.trigger(['business_name', 'fiscal_year_start_month'])
            if (isValid) goTo('ownership')
        }
        if (stage === 'ownership') {
            const isValid = await form.trigger('ownership')
            if (isValid) goTo('chart')
        }
    }

    const canGoBack = !setup.isResuming || (setup.accountCount ?? 0) === 0

    const goBack = () => {
        if (!canGoBack) return
        if (stage === 'chart') goTo('ownership')
        if (stage === 'ownership') goTo('business')
    }

    // A ref, because two presses in one tick both see the same stale part.
    const isPressed = useRef(false)

    const settle = (outcome: SetupOutcome, before: { stage: Stage; failure: Failure | null }) => {
        if (outcome.ok) {
            goTo('done')
            next?.()
            return
        }
        if ('busy' in outcome) {
            // Another run owns the write: leave everything as it was.
            goTo(before.stage)
            setFailure(before.failure)
            return
        }
        setFailure({ failedAccount: outcome.failedAccount, message: outcome.message })
        goTo('error')
    }

    const submit = async (write: (values: SetupValues) => Promise<SetupOutcome>) => {
        if (isPressed.current || !setup.isReady) return
        isPressed.current = true
        try {
            const before = { stage, failure }
            await form.handleSubmit(
                async values => {
                    setFailure(null)
                    goTo('creating')
                    settle(await write(toSetupValues(values)), before)
                },
                // The field errors render on the Business part only.
                () => {
                    if (stage !== 'business') goTo('business')
                }
            )()
        } finally {
            isPressed.current = false
        }
    }

    const create = () => submit(setup.create)
    const skipChart = () => submit(setup.skipChart)

    const selectOwnership = (value: Ownership) =>
        form.setValue('ownership', value, { shouldDirty: true })

    return {
        part,
        form,
        errors,
        positionLabel: positionLabelOf(part),
        ownership,
        selectOwnership,
        groups: groupStarterChart(chart),
        chartCount: chart.length,
        accountCount: setup.accountCount,
        canGoBack,
        canSkip: !setup.isResuming,
        businessName: settings?.business_name ?? '',
        progress: setup.progress,
        failure,
        hasLoadError: setup.hasLoadError,
        retryLoad: setup.retryLoad,
        hasOpeningBalances: openingBalances !== undefined,
        goNext,
        goBack,
        create,
        skipChart,
        retry: create,
        openChart: () => router.push(orgHref('books/accounts')),
        openOpeningBalances: () => {
            if (openingBalances) router.push(orgHref(openingBalances.href))
        },
        continueAction: continueActionOf(part, {
            chartCount: chart.length,
            goNext,
            create,
        }),
    }
}

function positionLabelOf(part: SetupPart): string {
    const position = POSITION[part]
    return position ? `Part ${position} of 3` : ''
}

type PartInputs = {
    stage: Stage
    isNonAdmin: boolean
    isLoading: boolean
    isCompleted: boolean
    isPopulated: boolean
    hasFailure: boolean
}

// Precedence, highest first: creating, done, error, non-admin, loading. A
// finished book then opens on Done, and `populated` replaces only the chart.
function partOf(input: PartInputs): SetupPart {
    const { stage } = input
    if (stage === 'creating' || stage === 'done') return stage
    if (stage === 'error' && input.hasFailure) return 'error'
    if (input.isCompleted && !input.isLoading) return 'done'
    if (input.isNonAdmin) return 'non-admin'
    if (input.isLoading) return 'loading'
    if (stage === 'chart' && input.isPopulated) return 'populated'
    return stage === 'error' ? 'chart' : stage
}

function continueActionOf(
    part: SetupPart,
    handlers: { chartCount: number; goNext: () => void; create: () => void }
): ContinueAction | null {
    const { chartCount, goNext, create } = handlers
    const actions: Partial<Record<SetupPart, ContinueAction>> = {
        business: { label: 'Next', onPress: goNext, isDisabled: false, requiresServer: false },
        ownership: { label: 'Next', onPress: goNext, isDisabled: false, requiresServer: false },
        chart: {
            label: `Create ${accountCountLabel(chartCount)}`,
            onPress: create,
            isDisabled: false,
            requiresServer: true,
        },
        creating: { label: 'Creating…', onPress: () => {}, isDisabled: true, requiresServer: true },
        error: { label: 'Try again', onPress: create, isDisabled: false, requiresServer: true },
        populated: {
            label: 'Finish setup',
            onPress: create,
            isDisabled: false,
            requiresServer: true,
        },
    }
    return actions[part] ?? null
}
