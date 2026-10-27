import type { ComponentType } from 'react'
import { GraduationCap, Presentation, ShieldCheck } from 'lucide-react'
import { ROLE_LABEL, type UserRole } from './roleMeta'

export { ROLE_LABEL } from './roleMeta'
export type { UserRole } from './roleMeta'

// One icon + one color family per role. Color is never the only signal: the icon
// shape and the text label (or aria-label in the compact variant) carry the role too.
export const ROLE_META: Record<
  UserRole,
  {
    icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
    /** Tinted background + text + border, for pills. */
    badge: string
    /** Text color only, for icons placed next to a name. */
    text: string
  }
> = {
  ADMIN: {
    icon: ShieldCheck,
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    text: 'text-amber-700',
  },
  PROFESSOR: {
    icon: Presentation,
    badge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    text: 'text-indigo-700',
  },
  STUDENT: {
    icon: GraduationCap,
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    text: 'text-emerald-700',
  },
}

export interface RoleBadgeProps {
  role: UserRole
  /**
   * `full`: icon + label pill. `compact`: icon only in a small tinted chip with an
   * accessible name, for dense lists where the role is already obvious from context.
   */
  variant?: 'full' | 'compact'
  className?: string
}

export function RoleBadge({ role, variant = 'full', className = '' }: RoleBadgeProps) {
  const meta = ROLE_META[role]
  const Icon = meta.icon
  const label = ROLE_LABEL[role]

  if (variant === 'compact') {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${meta.badge} ${className}`}
      >
        <Icon className="h-3 w-3" aria-hidden={true} />
      </span>
    )
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold leading-none ${meta.badge} ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden={true} />
      {label}
    </span>
  )
}
