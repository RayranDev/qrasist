'use client'

import { TriangleAlert, type LucideIcon } from 'lucide-react'

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  loadingLabel = 'Procesando...',
  loading = false,
  icon: Icon = TriangleAlert,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  loadingLabel?: string
  loading?: boolean
  icon?: LucideIcon
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6 text-amber-500" strokeWidth={2} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">{title}</h3>
        <p className="text-sm text-gray-500 text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition disabled:opacity-50"
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
