import { PickMenu } from '@tinycld/core/ui/pick-menu'
import { RANGE_PRESETS, type RangePreset } from '../../lib/register-range'

interface RegisterRangeSelectProps {
    preset: RangePreset
    onPreset(preset: RangePreset): void
}

export function RegisterRangeSelect({ preset, onPreset }: RegisterRangeSelectProps) {
    const items = RANGE_PRESETS.map(({ id, label }) => ({
        id,
        label,
        isSelected: id === preset,
        onSelect: () => onPreset(id),
    }))
    const selected = RANGE_PRESETS.find(p => p.id === preset)
    return (
        <PickMenu
            testID="register-range"
            purpose="Date range"
            label={selected?.label ?? ''}
            size="touch"
            items={items}
        />
    )
}
