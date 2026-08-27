/**
 * Captura la geolocalizacion del navegador a mejor esfuerzo, para
 * auditoria antifraude (nunca para bloquear un registro). Se resuelve
 * con null si el usuario niega el permiso, el dispositivo no soporta
 * geolocalizacion, o no responde dentro del timeout -- en ningun caso
 * rechaza ni hace esperar al flujo principal (crear sesion / escanear
 * QR) mas de lo estrictamente necesario.
 */
export function getBestEffortLocation(timeoutMs = 4000): Promise<{
  latitude: number
  longitude: number
} | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    const timer = setTimeout(() => resolve(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
      { timeout: timeoutMs, maximumAge: 60000 }
    )
  })
}
