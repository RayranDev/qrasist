import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'QR-Asist · Universidad Republicana',
    short_name: 'QR-Asist',
    description:
      'Sistema de control de asistencia académica mediante QR de la Corporación Universitaria Republicana.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#002849',
    lang: 'es',
    icons: [
      {
        src: '/brand/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/brand/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/brand/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
