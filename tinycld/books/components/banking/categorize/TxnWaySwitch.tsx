import { LoadingState } from '@tinycld/core/components/LoadingState'
import { SetupTabs } from '@tinycld/core/components/setup/wizard/SetupTabs'
import { useCallback } from 'react'
import { View } from 'react-native'
import { type BankCategorizeModel, useAskedFocus } from '../../../hooks/useBankCategorize'
import type { TxnWay } from '../../../lib/bank-categorize'

function wayTabs(suggestionCount: number): { value: TxnWay; label: string }[] {
    const matchLabel = suggestionCount > 0 ? `Match (${suggestionCount})` : 'Match'
    return [
        { value: 'categorize', label: 'Categorize' },
        { value: 'match', label: matchLabel },
        { value: 'transfer', label: 'Transfer' },
    ]
}

// Core SetupTabs takes no ref, so the selected tab is found inside this switch's own
// wrapper (web only: useAskedFocus does nothing on native).
function focusTab(wrapper: HTMLElement, index: number) {
    const tab = wrapper.querySelectorAll<HTMLElement>('[role="tab"]')[index]
    tab?.focus()
}

// The way switch of a For review transaction, directly above the section it controls,
// under the drawer's top border; core LoadingState until the suggestions decide the
// default way. Core SetupTabs has no disabled state, so while the write is sent the
// wrapper takes no press (onWay refuses too) and reads as disabled. When the shown way is
// Match, the focus a writer's open asks for goes to the selected tab, which is no text
// field, so the list keys keep working.
export function TxnWaySwitch({ model }: { model: BankCategorizeModel }) {
    const tabs = wayTabs(model.suggestionCount)
    const selected = tabs.findIndex(tab => tab.value === model.way)
    const focusSelected = useCallback((node: HTMLElement) => focusTab(node, selected), [selected])
    const attach = useAskedFocus(model.view === 'switch' && model.way === 'match', focusSelected)
    if (model.view === 'loading') {
        return (
            <View testID="bank-way-loading" className="border-t border-border py-6">
                <LoadingState />
            </View>
        )
    }
    const look = model.isSending ? 'opacity-50' : ''
    const pointerEvents = model.isSending ? 'none' : 'auto'
    const onChange = (next: TxnWay) => model.onWay(next)
    return (
        <View
            ref={attach}
            testID="bank-way"
            className={`border-t border-border pt-4 ${look}`}
            pointerEvents={pointerEvents}
            aria-disabled={model.isSending}
        >
            <SetupTabs testID="bank-way" tabs={tabs} value={model.way} onChange={onChange} />
        </View>
    )
}
