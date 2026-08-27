'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QrCode, BookOpen, History } from 'lucide-react'

const TABS = [
  { href: '/student/scanner', label: 'Escanear', icon: QrCode },
  { href: '/student/subjects', label: 'Materias', icon: BookOpen },
  { href: '/student/history', label: 'Historial', icon: History },
]

export default function StudentTabBar() {
  const pathname = usePathname()

  return (
    <nav className="sticky bottom-0 inset-x-0 bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)] z-40">
      <div className="max-w-md mx-auto grid grid-cols-3">
        {TABS.map((tab) => {
          const active = pathname === tab.href
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-1 py-2.5 relative"
            >
              {active && (
                <span className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-emerald-600" />
              )}
              <Icon
                className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-gray-300'}`}
                strokeWidth={active ? 2.5 : 2}
              />
              <span
                className={`text-[11px] font-bold ${active ? 'text-emerald-600' : 'text-gray-400'}`}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
