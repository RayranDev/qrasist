'use client'

import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CircleAlert } from 'lucide-react'
import { refreshSessionQrToken } from '@/lib/actions/session'

interface QRDisplayProps {
  sessionId: string
  qrToken: string
  expiresAt: string
  // Cada cuanto se rota el token, elegido por el profesor al generar
  // la sesion (entre 10 y 60s -- ver session.ts). Corto a proposito:
  // una foto del QR compartida por WhatsApp queda inutil casi al
  // instante en vez de seguir siendo valida los 15 minutos completos
  // de la sesion.
  rotationSeconds: number
}

export default function QRDisplay({
  sessionId,
  qrToken,
  expiresAt,
  rotationSeconds,
}: QRDisplayProps) {
  const [currentToken, setCurrentToken] = useState(qrToken)
  const [timeLeft, setTimeLeft] = useState('')
  const [isExpired, setIsExpired] = useState(false)
  const isExpiredRef = useRef(false)

  useEffect(() => {
    const target = new Date(expiresAt).getTime()

    const interval = setInterval(() => {
      const now = new Date().getTime()
      const distance = target - now

      if (distance <= 0) {
        clearInterval(interval)
        setTimeLeft('00:00')
        setIsExpired(true)
        isExpiredRef.current = true
      } else {
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((distance % (1000 * 60)) / 1000)
        setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [expiresAt])

  useEffect(() => {
    const rotate = async () => {
      if (isExpiredRef.current) return
      const result = await refreshSessionQrToken(sessionId)
      if (result.success && result.qrToken) {
        setCurrentToken(result.qrToken)
      }
      // Si falla (ej. la sesion ya expiro entre tanto), simplemente
      // no se actualiza el token -- el chequeo de expiresAt de arriba
      // ya se encarga de mostrar la pantalla de "QR Expirado".
    }

    const interval = setInterval(rotate, rotationSeconds * 1000)
    return () => clearInterval(interval)
  }, [sessionId, rotationSeconds])

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl shadow-sm border border-gray-100 max-w-sm mx-auto">
      {isExpired ? (
        <div className="text-center py-10">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <CircleAlert className="w-8 h-8" strokeWidth={2} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">QR Expirado</h2>
          <p className="text-gray-500">Este código ya no es válido para asistencia.</p>
        </div>
      ) : (
        <>
          <div className="bg-emerald-50 px-4 py-2 rounded-full mb-8">
            <p className="text-emerald-700 font-medium text-sm flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Activo • {timeLeft}
            </p>
          </div>

          <div className="p-4 bg-white border-2 border-emerald-50 rounded-2xl">
            <QRCodeSVG
              value={currentToken}
              size={240}
              level="H"
              includeMargin={true}
              fgColor="#111827"
            />
          </div>

          <p className="mt-8 text-gray-500 text-sm text-center">
            Pide a tus estudiantes que escaneen este código desde su aplicación móvil.
          </p>
          <p className="mt-1 text-gray-400 text-xs text-center">
            El código se renueva cada {rotationSeconds} segundos por seguridad.
          </p>
        </>
      )}
    </div>
  )
}
