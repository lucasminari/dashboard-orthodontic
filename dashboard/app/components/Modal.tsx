'use client';

import { useEffect } from 'react';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  titulo?: string;
  subtitulo?: string;
  children: React.ReactNode;
  /** sm | md | lg | xl */
  largura?: 'sm' | 'md' | 'lg' | 'xl';
}

const LARGURAS = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export function Modal({ aberto, onFechar, titulo, subtitulo, children, largura = 'md' }: Props) {
  // Fecha com ESC
  useEffect(() => {
    if (!aberto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', handler);
    // Trava scroll do body
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = overflowAntes;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onFechar}
    >
      <div
        className={`bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full ${LARGURAS[largura]} max-h-[90vh] overflow-hidden flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        {(titulo || subtitulo) && (
          <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-4">
            <div className="min-w-0">
              {titulo && (
                <h3 className="text-lg font-semibold text-gray-100 truncate">{titulo}</h3>
              )}
              {subtitulo && (
                <p className="text-xs text-gray-400 mt-0.5">{subtitulo}</p>
              )}
            </div>
            <button
              onClick={onFechar}
              className="text-gray-500 hover:text-gray-200 text-xl leading-none px-2 -mr-2 -mt-1 transition"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        )}
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>
  );
}
