import type { ComponentType } from 'react'
import type { SectionId } from '../../lib/settings-sections'
import { CompanySection } from './CompanySection'

interface SectionBodyProps {
    section: SectionId
    isAdmin: boolean
}

const BODIES: Partial<Record<SectionId, ComponentType<{ isAdmin: boolean }>>> = {
    company: CompanySection,
}

export function SectionBody({ section, isAdmin }: SectionBodyProps) {
    const Body = BODIES[section]
    if (!Body) return null
    return <Body isAdmin={isAdmin} />
}
