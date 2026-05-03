'use client';

interface Props {
  texto: string;
  className?: string;
}

/** Pequeno (i) com tooltip nativo via title. Simples e funcional. */
export function Tooltip({ texto, className = '' }: Props) {
  return (
    <span
      title={texto}
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-700 text-gray-500 text-[9px] cursor-help align-middle ${className}`}
    >
      i
    </span>
  );
}
