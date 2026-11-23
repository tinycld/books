import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { ChevronDown } from 'lucide-react-native'
import { Pressable, Text } from 'react-native'
import { WIDGET_NAMES, type WidgetId } from '../../lib/dashboard-prefs'

const TRIGGER_STYLE = { minHeight: 32 }
const DISABLED_TRIGGER_STYLE = { minHeight: 32, opacity: 0.4 }

interface PeriodMenuProps<T extends string> {
    widget: WidgetId
    // Each period id with its preset name, in menu order.
    labels: Readonly<Record<T, string>>
    value: T
    onChange: (period: T) => void
    // The preference has not loaded: no change is offered (spec §3 "What is saved").
    isDisabled: boolean
}

// A widget's period picker: core Menu (a sheet titled "<Widget> period" on a phone) over a
// trigger that reads the chosen period.
export function PeriodMenu<T extends string>({
    widget,
    labels,
    value,
    onChange,
    isDisabled,
}: PeriodMenuProps<T>) {
    const muted = useThemeColor('muted-foreground')
    const name = WIDGET_NAMES[widget]
    // Object.keys gives string[]; the keys of `labels` are its period ids.
    const ids = Object.keys(labels) as T[]
    const items = ids.map(id => (
        <Menu.Item
            key={id}
            label={labels[id]}
            isSelected={id === value}
            onSelect={() => onChange(id)}
            testID={`dashboard-period-${widget}-${id}`}
        />
    ))
    const triggerStyle = isDisabled ? DISABLED_TRIGGER_STYLE : TRIGGER_STYLE
    const trigger = (
        <Pressable
            testID={`dashboard-period-${widget}`}
            accessibilityRole="button"
            accessibilityLabel={`${name} period: ${labels[value]}`}
            disabled={isDisabled}
            className="flex-row items-center gap-1 rounded-md border border-border px-2 web:cursor-pointer"
            style={triggerStyle}
            hitSlop={6}
        >
            <Text className="text-xs text-foreground">{labels[value]}</Text>
            <ChevronDown size={12} color={muted} />
        </Pressable>
    )
    return (
        <Menu trigger={trigger} title={`${name} period`}>
            {items}
        </Menu>
    )
}
