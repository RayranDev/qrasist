'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 5000

const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  info: 'bg-gray-800',
}

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => removeToast(id), AUTO_DISMISS_MS)
    },
    [removeToast]
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/*
        Arriba, no abajo: un formulario de "crear" siempre deja el
        item nuevo justo debajo, cerca del borde inferior visible en
        un celular -- un toast fijo abajo lo tapaba (bug reportado).
        Además vive en el layout raíz, así que sigue montado al
        cambiar de pestaña con navegación cliente; si tapaba algo
        abajo en una pantalla corta, tapaba TODO el contenido nuevo.
      */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto z-100 flex flex-col gap-2 sm:w-full sm:max-w-sm"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div
              key={t.id}
              role="status"
              className={`animate-in fade-in slide-in-from-top-2 pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg duration-300 ${STYLES[t.type]}`}
            >
              <Icon className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={2} />
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="ml-1 text-white/70 hover:text-white"
                aria-label="Cerrar notificación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx.showToast
}
