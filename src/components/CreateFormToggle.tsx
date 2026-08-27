'use client'

import { Plus, type LucideIcon } from 'lucide-react'

// Botón compacto que reemplaza a un formulario de "crear" cuando
// está cerrado. Objetivo: en pantallas angostas el formulario ya no
// ocupa toda la parte de arriba empujando filtros y lista muy abajo
// -- se abre solo cuando hace falta, y el formulario mismo se
// encarga de volver a colapsarse tras un alta exitosa.
export default function CreateFormToggle({
  label,
  icon: Icon = Plus,
  onClick,
}: {
  label: string
  icon?: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-3.5 mb-6 bg-white border-2 border-dashed border-gray-200 rounded-2xl text-sm font-bold text-gray-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/40 transition"
    >
      <Icon className="w-4 h-4" strokeWidth={2.5} />
      {label}
    </button>
  )
}
