'use client'

import Link from 'next/link'
import { QrCode, LogOut } from 'lucide-react'

interface AdminNavLink {
  href: string
  label: string
}

const NAV_LINKS: AdminNavLink[] = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/subjects', label: 'Materias' },
  { href: '/admin/users', label: 'Usuarios' },
  { href: '/admin/academic', label: 'Carreras' },
]

export default function AdminHeader({
  eyebrow,
  title,
  description,
  activeHref,
}: {
  eyebrow?: string
  title: string
  description?: string
  activeHref?: string
}) {
  return (
    <header className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-8 pb-6 border-b border-neutral-200/80">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0 shadow-xs">
          <QrCode className="w-5 h-5 text-emerald-400" strokeWidth={2.25} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-neutral-900 tracking-tight">{title}</h1>
            {eyebrow && (
              <span className="text-[11px] font-mono font-semibold text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-md">
                {eyebrow}
              </span>
            )}
          </div>
          {description && (
            <p className="text-neutral-500 text-xs font-normal mt-0.5">{description}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
        {/* Segmented control de navegación */}
        <nav className="inline-flex p-1 bg-neutral-100 rounded-xl border border-neutral-200/80">
          {NAV_LINKS.map((link) => {
            const isActive = link.href === activeHref
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  isActive
                    ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors border border-transparent hover:border-neutral-200"
            title="Cerrar sesión"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Salir</span>
          </button>
        </form>
      </div>
    </header>
  )
}
