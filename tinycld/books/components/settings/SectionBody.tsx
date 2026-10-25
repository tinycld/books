import type { ComponentType } from 'react'
import type { SectionId } from '../../lib/settings-sections'
import { AccessSection } from './AccessSection'
import { AccountingSection } from './AccountingSection'
import { CompanySection } from './CompanySection'
import { NumberingSection } from './NumberingSection'

interface SectionBodyProps {
    section: SectionId
    isAdmin: boolean
}

const BODIES: Partial<Record<SectionId, ComponentType<{ isAdmin: boolean }>>> = {
    company: CompanySection,
    accounting: AccountingSection,
    numbering: NumberingSection,
    access: AccessSection,
}

export function SectionBody({ section, isAdmin }: SectionBodyProps) {
    const Body = BODIES[section]
    if (!Body) return null
    return <Body isAdmin={isAdmin} />
}
