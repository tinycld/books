import { FAB } from '@tinycld/core/components/FAB'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Plus } from 'lucide-react-native'
import { useState } from 'react'
import { useNewMenu } from '../hooks/useNewMenu'
import { NewMenu } from './NewMenu'

type NewMenuState = ReturnType<typeof useNewMenu>

interface NewFabContentProps {
    columns: NewMenuState['columns']
    onSelect: NewMenuState['open']
}

// Open state lives here, and this component is mounted only while the FAB
// is visible, so the state is dropped whenever the FAB hides.
function NewFabContent({ columns, onSelect }: NewFabContentProps) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <FAB icon={Plus} accessibilityLabel="New" isVisible onPress={() => setIsOpen(true)} />
            <NewMenu
                columns={columns}
                onSelect={onSelect}
                isOpen={isOpen}
                onOpenChange={setIsOpen}
            />
        </>
    )
}

interface NewFabGateProps extends NewFabContentProps {
    isVisible: boolean
}

function NewFabGate({ isVisible, columns, onSelect }: NewFabGateProps) {
    if (!isVisible) return null
    return <NewFabContent columns={columns} onSelect={onSelect} />
}

export function NewFab() {
    const isMobile = useBreakpoint() === 'mobile'
    const { isVisible, columns, open } = useNewMenu()

    return <NewFabGate isVisible={isMobile && isVisible} columns={columns} onSelect={open} />
}
