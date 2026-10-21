import Image from 'next/image'
import { INSTITUTION_NAME } from '@/lib/brand'

/**
 * Marca institucional compartida: escudo + nombre de la app + subtítulo
 * con el nombre oficial de la institución. Se usa en los headers de las tres áreas (admin,
 * profesor, estudiante) para mantener identidad consistente.
 */
export default function InstitutionMark({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md'
  className?: string
}) {
  const crestSize = size === 'sm' ? 32 : 40

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/brand/escudo.png"
        alt={`Escudo de la ${INSTITUTION_NAME}`}
        width={crestSize}
        height={crestSize}
        className="shrink-0 object-contain"
        priority
      />
      <div className="min-w-0">
        <p
          className={`font-black leading-none text-gray-900 tracking-tight ${size === 'sm' ? 'text-sm' : 'text-base'}`}
        >
          QR-Asist
        </p>
        <p className="text-[10px] md:text-[11px] text-gray-500 font-semibold leading-tight truncate">
          {INSTITUTION_NAME}
        </p>
      </div>
    </div>
  )
}
