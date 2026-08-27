import type { ReactNode } from 'react'

// Marco visual consistente para los bloques de filtro (Usuarios,
// Materias, Materias del estudiante): antes eran selects sueltos sin
// etiqueta, indistinguibles del formulario de arriba o de la lista de
// abajo. Este wrapper + FilterField les da un encabezado y una
// etiqueta por campo, igual que ya tienen los formularios de alta.
export default function FilterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Filtrar</p>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  )
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  )
}
