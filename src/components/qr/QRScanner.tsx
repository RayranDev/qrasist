'use client'

import { useEffect, useState, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { registerAttendance } from '@/lib/actions/attendance'
import { getBestEffortLocation } from '@/lib/utils/geolocation'
import { Check, TriangleAlert, CircleX } from 'lucide-react'

export default function QRScanner() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'guest'>('idle')
  const [message, setMessage] = useState('')
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)

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
          async (decodedText) => {
            if (html5QrCodeRef.current?.isScanning) {
              await html5QrCodeRef.current.stop()
            }
            setStatus('loading')

            const uuidRegex =
              /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
            if (!uuidRegex.test(decodedText)) {
              setStatus('error')
              setMessage('QR inválido. Formato no reconocido.')
              return
            }

            try {
              const coords = await getBestEffortLocation()
              const result = await registerAttendance(decodedText, coords || undefined)
              if (result.success) {
                if (result.isGuest) {
                  setStatus('guest')
                  setMessage(result.message || 'Registrado como invitado')
                } else {
                  setStatus('success')
                  setMessage(result.message || 'Asistencia registrada')
                }
              } else {
                setStatus('error')
                setMessage(result.error || 'Error al registrar')
              }
            } catch {
              setStatus('error')
              setMessage('Fallo de red al registrar.')
            }
          },
          () => {}
        )
      } catch {
        setStatus('error')
        setMessage('No se pudo acceder a la cámara. Verifica los permisos.')
      }
    }

    startScanner()

    return () => {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {})
      }
    }
  }, [status])

  const reset = () => setStatus('idle')

  return (
    <div className="w-full">
      {status === 'idle' && (
        // html5-qrcode ya dibuja su propio recuadro de escaneo (el
        // "qrbox" de abajo: sombreado + esquinas blancas) sobre el
        // video en tiempo real. Un segundo marco superpuesto acá, en
        // CSS, no puede coincidir con el suyo -- el tamaño real del
        // qrbox lo calcula la librería contra el video ya montado,
        // que varía según la cámara del dispositivo. El resultado
        // eran dos recuadros de tamaños distintos, uno encima del
        // otro, mal alineados (bug reportado). Se deja un solo
        // recuadro: el nativo de la librería.
        <div className="rounded-2xl overflow-hidden border-2 border-emerald-100 bg-black aspect-square flex items-center justify-center relative">
          <div id="qr-reader" className="w-full h-full" />
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center py-10 gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin" />
          <p className="font-semibold text-gray-600">Validando asistencia...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center py-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <Check className="w-10 h-10 text-emerald-500" strokeWidth={2.5} />
          </div>
          <h3 className="text-xl font-black text-emerald-700 mb-2">¡Asistencia Registrada!</h3>
          <p className="text-center text-sm font-semibold text-emerald-600 bg-emerald-50 rounded-xl px-4 py-2.5 mb-6 max-w-xs">
            {message}
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition shadow-sm active:scale-95"
          >
            Escanear otro QR
          </button>
        </div>
      )}

      {status === 'guest' && (
        <div className="flex flex-col items-center py-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <TriangleAlert className="w-10 h-10 text-amber-500" strokeWidth={2} />
          </div>
          <h3 className="text-xl font-black text-amber-700 mb-2">Registro de Invitado</h3>
          <p className="text-center text-sm font-semibold text-amber-600 bg-amber-50 rounded-xl px-4 py-2.5 mb-6 max-w-xs">
            {message}
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition shadow-sm active:scale-95"
          >
            Escanear otro QR
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center py-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <CircleX className="w-10 h-10 text-red-500" strokeWidth={2} />
          </div>
          <h3 className="text-xl font-black text-red-700 mb-2">Error de Registro</h3>
          <p className="text-center text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-4 py-2.5 mb-6 max-w-xs">
            {message}
          </p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition shadow-sm active:scale-95"
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  )
}
