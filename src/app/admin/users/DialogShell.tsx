'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal frame (role="dialog", aria-modal) with the same look as the
 * other admin modals. Escape closes it, Tab stays inside, focus moves in on open
 * (to the element marked `data-autofocus`, else the first focusable one) and goes
 * back to the previously focused element on close. Rendered in a portal so table
 * rows and cards never clip or re-position it.
 */
export default function DialogShell({
  labelledBy,
  onClose,
  closeDisabled = false,
  maxWidth = 'max-w-md',
  children,
}: {
  labelledBy: string
  onClose: () => void
  /** Blocks Escape while an action is running. */
  closeDisabled?: boolean
  maxWidth?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ onClose, closeDisabled })
  useEffect(() => {
    stateRef.current = { onClose, closeDisabled }
  })

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : []

    const initial = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0]
    initial?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!stateRef.current.closeDisabled) stateRef.current.onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel?.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-neutral-200 shadow-xl animate-in zoom-in-95 duration-150`}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
