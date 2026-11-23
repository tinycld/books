import { FAB } from '@tinycld/core/components/FAB'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { useUrl } from '@tinycld/core/lib/use-url'
import { Plus } from 'lucide-react-native'
import { useNewMenu } from '../hooks/useNewMenu'
import { hidesNewFab } from '../lib/shell-nav'
import { useBooksUIStore } from '../stores/books-ui-store'

// The round New button of the phone layout. The New actions are in the Books sidebar, which
// on a phone is the drawer, and core's drawer has no visible control that opens it (only a
// pan from the left edge). So the button opens the drawer with the New section open.
export function NewFab() {
    const isMobile = useBreakpoint() === 'mobile'
    const { isVisible } = useNewMenu()
    const isOnEntry = hidesNewFab(useUrl().pathname)
    const setDrawerOpen = useWorkspaceStore(s => s.setDrawerOpen)
    const openNew = useBooksUIStore(s => s.openNew)
    const showNewActions = () => {
        openNew()
        setDrawerOpen(true)
    }

    return (
        <FAB
            icon={Plus}
            accessibilityLabel="New"
            isVisible={isMobile && isVisible && !isOnEntry}
            onPress={showNewActions}
        />
    )
}
