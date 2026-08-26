'use client'

import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function Modal({
  title,
  description,
  onClose,
  children,
  maxWidth = 'max-w-lg',
}: {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
}) {
  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200`}
      >
        <div className="flex justify-between items-start gap-4 p-6 pb-4 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 flex-1">{children}</div>
      </div>
    </div>,
    document.body
  )
}
