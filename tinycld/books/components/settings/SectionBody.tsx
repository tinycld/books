import type { ComponentType } from 'react'
import type { SectionId } from '../../lib/settings-sections'
import type { BooksSettings } from '../../types'
import { AccessSection } from './AccessSection'
import { AccountingSection } from './AccountingSection'
import { CompanySection } from './CompanySection'
import { Form1099Section } from './Form1099Section'
import { NumberingSection } from './NumberingSection'
import { PurchasesSection } from './PurchasesSection'
import { SalesSection } from './SalesSection'

// The settings row comes from the panel, which keeps it while a reload of the read runs,
// so a section with a form never unmounts it with its unsaved text.
interface BodyProps {
    settings: BooksSettings
    isAdmin: boolean
}

interface SectionBodyProps extends BodyProps {
    section: SectionId
}

const BODIES: Partial<Record<SectionId, ComponentType<BodyProps>>> = {
    company: CompanySection,
    accounting: AccountingSection,
    sales: SalesSection,
    purchases: PurchasesSection,
    numbering: NumberingSection,
    'form-1099': Form1099Section,
    access: AccessSection,
}

export function SectionBody({ section, settings, isAdmin }: SectionBodyProps) {
    const Body = BODIES[section]
    if (!Body) return null
    return <Body settings={settings} isAdmin={isAdmin} />
}
