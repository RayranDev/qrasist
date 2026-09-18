'use client'

import { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CircleAlert, PowerOff, ShieldCheck } from 'lucide-react'
import { refreshSessionQrToken, closeSession } from '@/lib/actions/session'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

interface QRDisplayProps {
  sessionId: string
  qrToken: string
  expiresAt: string
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
  const [isClosing, setIsClosing] = useState(false)
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
    }

    const interval = setInterval(rotate, rotationSeconds * 1000)
    return () => clearInterval(interval)
  }, [sessionId, rotationSeconds])

  const handleManualClose = async () => {
    if (
      !confirm(
        '¿Deseas finalizar la sesión de asistencia ahora? El código QR quedará invalidado de inmediato.'
      )
    ) {
      return
    }
    setIsClosing(true)
    const res = await closeSession(sessionId)
    if (res.success) {
      setIsExpired(true)
      isExpiredRef.current = true
      setTimeLeft('00:00')
    }
    setIsClosing(false)
  }

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center">
      {isExpired ? (
        <div className="w-full bg-white rounded-3xl p-8 md:p-12 border border-neutral-200 text-center shadow-xs animate-in fade-in duration-200">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
            <CircleAlert className="w-8 h-8" strokeWidth={2} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sesión Finalizada</h2>
          <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">
            El código de asistencia ha expirado o fue cerrado manualmente. No se admiten nuevos
            registros.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/professor/history">
              <Button variant="primary" size="md">
                Ver lista de asistentes
              </Button>
            </Link>
            <Link href="/professor/subjects">
              <Button variant="secondary" size="md">
                Volver a materias
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="w-full bg-white rounded-3xl p-6 md:p-10 border border-neutral-200 flex flex-col items-center shadow-xs">
          {/* Header con estado y contador gigante legible a 2 metros */}
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold mb-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <span>Código activo en rotación antifraude</span>
            </div>

            {/* Countdown gigante */}
            <div className="text-5xl md:text-7xl font-mono font-black text-gray-900 tracking-tight py-1">
              {timeLeft || '--:--'}
            </div>
            <p className="text-xs text-gray-400 font-medium mt-1">Tiempo restante para escanear</p>
          </div>

          {/* QR Grande optimizado para proyector */}
          <div className="p-4 md:p-6 bg-white border border-neutral-200 rounded-2xl shadow-xs flex items-center justify-center">
            <QRCodeSVG
              value={currentToken}
              size={320}
              level="H"
              includeMargin={true}
              fgColor="#0f172a"
              className="w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] md:w-[360px] md:h-[360px]"
            />
          </div>

          <div className="flex items-center justify-between w-full mt-8 pt-6 border-t border-gray-100 gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Rotación cada {rotationSeconds}s contra fotos de WhatsApp</span>
            </div>

            <Button
              onClick={handleManualClose}
              variant="danger"
              size="sm"
              isLoading={isClosing}
              leftIcon={<PowerOff className="w-3.5 h-3.5" />}
            >
              Finalizar sesión ahora
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
