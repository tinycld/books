import { SelectBox } from '../SelectBox'

interface AccountSelectBoxProps {
    id: string
    name: string
    isSelected: (id: string) => boolean
    onSelect: (id: string) => void
}

// The box sits inside the pressable row; SelectBox stops the press so it does not also
// open the account.
export function AccountSelectBox({ id, name, isSelected, onSelect }: AccountSelectBoxProps) {
    const state = isSelected(id) ? 'checked' : 'empty'
    const onPress = () => onSelect(id)
    return (
        <SelectBox
            testID={`account-select-${id}`}
            label={`Select ${name}`}
            state={state}
            onPress={onPress}
        />
    )
}
