/**
 * Validación y verificación de integridad para Códigos Estudiantiles de 12 dígitos.
 * Utiliza el algoritmo de checksum ponderado Modulo 10 (Luhn modificado)
 * para evitar códigos inventados sin necesidad de sincronizar tablas externas.
 */

export function calculateStudentCodeChecksum(digits11: string): number {
  if (!/^\d{11}$/.test(digits11)) {
    throw new Error('Se requieren exactamente 11 dígitos numéricos para calcular el checksum')
  }

  let sum = 0
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(digits11[i], 10)
    // Ponderación alternada 2 y 1 de derecha a izquierda
    const weight = (11 - i) % 2 === 1 ? 2 : 1
    const product = digit * weight
    sum += product > 9 ? product - 9 : product
  }

  const remainder = sum % 10
  return remainder === 0 ? 0 : 10 - remainder
}

export function validateStudentCode(code: string): { isValid: boolean; error?: string } {
  const trimmed = (code || '').trim()

  if (!trimmed) {
    return { isValid: false, error: 'El código estudiantil es obligatorio.' }
  }

  if (!/^\d{12}$/.test(trimmed)) {
    return { isValid: false, error: 'El código debe contener exactamente 12 dígitos numéricos.' }
  }

  const base = trimmed.slice(0, 11)
  const providedChecksum = parseInt(trimmed.slice(11), 10)
  const expectedChecksum = calculateStudentCodeChecksum(base)

  if (providedChecksum !== expectedChecksum) {
    return {
      isValid: false,
      error: 'El código ingresado no tiene un dígito de control válido.',
    }
  }

  return { isValid: true }
}

/**
 * Función auxiliar para generar un código válido (útil para tests y sembrado de datos)
 */
export function generateValidStudentCode(prefix11: string = '20261012345'): string {
  const cleanPrefix = prefix11.replace(/\D/g, '').padEnd(11, '0').slice(0, 11)
  const checksum = calculateStudentCodeChecksum(cleanPrefix)
  return `${cleanPrefix}${checksum}`
}
