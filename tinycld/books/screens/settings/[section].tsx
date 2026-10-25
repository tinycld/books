import { useLocalSearchParams } from 'expo-router'
import { SettingsShell } from '../../components/settings/SettingsShell'
import { sectionFromParam } from '../../hooks/useSettingsShell'

export default function SettingsSectionScreen() {
    const { section } = useLocalSearchParams<{ section: string }>()
    return <SettingsShell section={sectionFromParam(section)} />
}
