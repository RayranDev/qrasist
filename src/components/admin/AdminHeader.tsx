import Link from 'next/link'

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
    <header className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center mb-8">
      <div>
        {eyebrow && <p className="text-sm font-semibold text-emerald-600 mb-1">{eyebrow}</p>}
        <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
        {description && <p className="text-gray-500 mt-1 text-sm">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        {NAV_LINKS.filter((link) => link.href !== activeHref).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            {link.label}
          </Link>
        ))}
        <form action="/auth/signout" method="post">
          <button className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
            Cerrar Sesión
          </button>
        </form>
      </div>
    </header>
  )
}
