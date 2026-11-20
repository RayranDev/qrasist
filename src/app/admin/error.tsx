'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * Fallback for any admin page whose server render throws. Several admin
 * loaders throw on purpose instead of showing partial data (see
 * fetchDashboardAttendanceData), so a failed query must end up here with a
 * way to try again rather than in a blank page.
 */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Not swallowed: the digest matches the server-side log entry.
    console.error('[admin] Error al cargar la página', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 md:p-8">
      <div className="max-w-xl mx-auto mt-16">
        <div
          role="alert"
          className="flex items-start gap-3 p-5 rounded-2xl bg-white border border-red-200 shadow-xs"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">No pudimos cargar esta página</h2>
            <p className="text-xs text-gray-600 mt-1 leading-snug">
              Ocurrió un problema al consultar los datos. Para no mostrarte cifras incompletas, no
              mostramos nada. Puedes intentarlo de nuevo; si el problema continúa, avisa al equipo
              técnico.
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() => retry()}
            >
              Intentar de nuevo
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
