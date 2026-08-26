import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-emerald-600 hover:text-emerald-700 font-semibold text-sm inline-flex items-center gap-1 mb-2 w-fit"
    >
      <ArrowLeft className="w-4 h-4" strokeWidth={2} />
      {children}
    </Link>
  )
}
