'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { registerAttendance, AttendanceErrorCode } from '@/lib/actions/attendance'
import { getBestEffortLocation } from '@/lib/utils/geolocation'
import { Check, TriangleAlert, CircleX, WifiOff, RefreshCw, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function QRScanner() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'late' | 'error' | 'guest'>(
    'idle'
  )
  const [message, setMessage] = useState('')
  const [errorCode, setErrorCode] = useState<AttendanceErrorCode | null>(null)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [lastDecodedToken, setLastDecodedToken] = useState<string | null>(null)
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)

  // Detector de conectividad en tiempo real
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleProcessScan = useCallback(async (decodedText: string) => {
    setLastDecodedToken(decodedText)

    if (html5QrCodeRef.current?.isScanning) {
      await html5QrCodeRef.current.stop().catch(() => {})
    }
    setStatus('loading')

    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
    if (!uuidRegex.test(decodedText)) {
      setStatus('error')
      setErrorCode('INVALID')
      setMessage('Código QR inválido. Formato no reconocido.')
      return
    }

    try {
      const coords = await getBestEffortLocation()
      const result = await registerAttendance(decodedText, coords || undefined)

      if (result.ok) {
        // Feedback háptico inmediato en móviles
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(100)
          } catch {
            // Ignorar si el dispositivo no lo permite
          }
        }

        if (result.data.isGuest) {
          setStatus('guest')
          setMessage(
            `Registrado como invitado en ${result.data.subjectName} a las ${result.data.time}`
          )
        } else if (result.data.isLate) {
          setStatus('late')
          setMessage(
            `Registrado como tarde en ${result.data.subjectName} (${result.data.subjectCode}) — ${result.data.time}`
          )
        } else {
          setStatus('success')
          setMessage(
            `${result.data.subjectName} (${result.data.subjectCode}) — ${result.data.time}`
          )
        }
      } else {
        setStatus('error')
        setErrorCode(result.code)
        setMessage(result.message)
      }
    } catch {
      setStatus('error')
      setErrorCode('SERVER_ERROR')
      setMessage('Fallo de red al registrar. Verifica tu conexión a internet.')
    }
  }, [])

  useEffect(() => {
    if (status !== 'idle') return

    const startScanner = async () => {
      try {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader')

        await html5QrCodeRef.current.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleProcessScan(decodedText)
          },
          () => {}
        )
      } catch {
        setStatus('error')
        setErrorCode('INVALID')
        setMessage('No se pudo acceder a la cámara. Verifica los permisos de tu navegador.')
      }
    }

    startScanner()

    return () => {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {})
      }
    }
  }, [status, handleProcessScan])

  const reset = () => {
    setErrorCode(null)
    setLastDecodedToken(null)
    setStatus('idle')
  }

  const retryLastScan = () => {
    if (lastDecodedToken) {
      handleProcessScan(lastDecodedToken)
    } else {
      reset()
    }
  }

  return (
    <div className="w-full flex flex-col items-center">
      {/* Indicador de conexión offline */}
      {!isOnline && (
        <div className="w-full mb-3 flex items-center justify-center gap-2 py-2 px-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-xl animate-in fade-in">
          <WifiOff className="w-4 h-4 text-amber-600" />
          <span>Sin conexión a internet. Los registros requieren datos móviles o Wi-Fi.</span>
        </div>
      )}

      {status === 'idle' && (
        <div className="w-full max-w-sm">
          <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-black aspect-square flex items-center justify-center relative shadow-sm">
            <div id="qr-reader" className="w-full h-full" />
          </div>
          <p className="text-center text-xs text-gray-500 mt-3 font-medium">
            Apunta la cámara al código QR proyectado en el aula
          </p>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-12 h-12 rounded-full border-3 border-emerald-100 border-t-emerald-600 animate-spin" />
          <p className="text-sm font-semibold text-gray-700">Validando asistencia...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center py-8 w-full max-w-xs text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-emerald-600" strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">¡Asistencia Confirmada!</h3>
          <p className="text-xs font-medium text-emerald-700 bg-emerald-50/80 border border-emerald-100 rounded-xl px-4 py-3 mb-6 w-full leading-relaxed">
            {message}
          </p>
          <Button onClick={reset} variant="primary" size="md" className="w-full">
            Escanear otro código
          </Button>
        </div>
      )}

      {status === 'late' && (
        <div className="flex flex-col items-center py-8 w-full max-w-xs text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-4">
            <Clock3 className="w-8 h-8 text-amber-600" strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Registrado como tarde</h3>
          <p className="text-xs font-medium text-amber-700 bg-amber-50/80 border border-amber-100 rounded-xl px-4 py-3 mb-6 w-full leading-relaxed">
            {message}
          </p>
          <Button onClick={reset} variant="primary" size="md" className="w-full">
            Escanear otro código
          </Button>
        </div>
      )}

      {status === 'guest' && (
        <div className="flex flex-col items-center py-8 w-full max-w-xs text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-4">
            <TriangleAlert className="w-8 h-8 text-amber-600" strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Registro de Invitado</h3>
          <p className="text-xs font-medium text-amber-700 bg-amber-50/80 border border-amber-100 rounded-xl px-4 py-3 mb-6 w-full leading-relaxed">
            {message}
          </p>
          <Button onClick={reset} variant="secondary" size="md" className="w-full">
            Escanear otro código
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center py-8 w-full max-w-xs text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-4">
            <CircleX className="w-8 h-8 text-red-600" strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No se pudo registrar</h3>
          <p className="text-xs font-medium text-red-700 bg-red-50/80 border border-red-100 rounded-xl px-4 py-3 mb-6 w-full leading-relaxed">
            {message}
          </p>
          <div className="w-full space-y-2">
            {errorCode === 'SERVER_ERROR' && lastDecodedToken ? (
              <Button
                onClick={retryLastScan}
                variant="primary"
                size="md"
                className="w-full"
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Reintentar registro
              </Button>
            ) : null}
            <Button
              onClick={reset}
              variant={errorCode === 'SERVER_ERROR' && lastDecodedToken ? 'secondary' : 'primary'}
              size="md"
              className="w-full"
            >
              Volver a escanear
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
