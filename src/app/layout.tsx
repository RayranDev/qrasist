import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import NavigationProgress from '@/components/NavigationProgress'
import { ToastProvider } from '@/components/toast/ToastProvider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'QR-Asist · Corporación Universitaria Republicana',
  description:
    'Sistema de control de asistencia académica mediante QR de la Corporación Universitaria Republicana.',
}

export const viewport: Viewport = {
  themeColor: '#002849',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <NavigationProgress />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
