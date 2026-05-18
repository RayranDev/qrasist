'use client'

import { useEffect, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { registerAttendance } from '@/lib/actions/attendance'

export default function QRScanner() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Prevenimos inicializar múltiples veces
    if (status !== 'idle') return;

    // Configuración de la cámara
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    )

    scanner.render(
      async (decodedText) => {
        // Al escanear exitosamente: detener cámara y procesar
        scanner.clear()
        setStatus('loading')

        // Validar si el texto tiene formato UUID
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
        if (!uuidRegex.test(decodedText)) {
          setStatus('error')
          setMessage('QR inválido. Formato no reconocido.')
          return
        }

        try {
          // Enviar token al backend
          const result = await registerAttendance(decodedText)
          if (result.success) {
            setStatus('success')
            setMessage(result.message || 'Asistencia registrada')
          } else {
            setStatus('error')
            setMessage(result.error || 'Error al registrar')
          }
        } catch (err) {
          setStatus('error')
          setMessage('Fallo de red al registrar. Revisa tu conexión.')
        }
      },
      (error) => {
        // Ignorar advertencias constantes (como "no se encuentra QR")
      }
    )

    // Limpieza al desmontar el componente
    return () => {
      scanner.clear().catch(console.error)
    }
  }, [status])

  return (
    <div className="w-full">
      {status === 'idle' && (
        <div className="rounded-2xl overflow-hidden border-2 border-indigo-100">
          <div id="qr-reader" className="w-full bg-white" />
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 font-medium text-gray-600">Validando asistencia...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center py-10 text-emerald-500 animate-in fade-in slide-in-from-bottom-4">
          <svg className="w-20 h-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xl font-bold text-emerald-600 mb-1">¡Registro Exitoso!</h3>
          <p className="text-center font-medium text-emerald-700">{message}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center py-10 text-red-500 animate-in fade-in slide-in-from-bottom-4">
          <svg className="w-20 h-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xl font-bold text-red-600 mb-1">Error de Registro</h3>
          <p className="font-medium text-center text-red-700 mb-6">{message}</p>
          <button 
            onClick={() => setStatus('idle')}
            className="px-6 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition shadow-sm active:scale-95"
          >
            Escanear de nuevo
          </button>
        </div>
      )}
    </div>
  )
}
