'use client'

import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface QRDisplayProps {
  qrToken: string
  expiresAt: string
}

export default function QRDisplay({ qrToken, expiresAt }: QRDisplayProps) {
  const [timeLeft, setTimeLeft] = useState('')
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const target = new Date(expiresAt).getTime()

    const interval = setInterval(() => {
      const now = new Date().getTime()
      const distance = target - now

      if (distance <= 0) {
        clearInterval(interval)
        setTimeLeft('00:00')
        setIsExpired(true)
      } else {
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((distance % (1000 * 60)) / 1000)
        setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [expiresAt])

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl shadow-sm border border-gray-100 max-w-sm mx-auto">
      {isExpired ? (
        <div className="text-center py-10">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
             <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">QR Expirado</h2>
          <p className="text-gray-500">Este código ya no es válido para asistencia.</p>
        </div>
      ) : (
        <>
          <div className="bg-indigo-50 px-4 py-2 rounded-full mb-8">
            <p className="text-indigo-700 font-medium text-sm flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Activo • {timeLeft}
            </p>
          </div>
          
          <div className="p-4 bg-white border-2 border-indigo-50 rounded-2xl">
            <QRCodeSVG 
              value={qrToken} 
              size={240}
              level="H"
              includeMargin={true}
              fgColor="#111827" 
            />
          </div>

          <p className="mt-8 text-gray-500 text-sm text-center">
            Pide a tus estudiantes que escaneen este código desde su aplicación móvil.
          </p>
        </>
      )}
    </div>
  )
}
