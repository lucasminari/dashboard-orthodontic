'use client';

interface Coluna<T> {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
}

interface Props<T> {
  nomeArquivo: string; // sem extensao
  linhas: T[];
  colunas: Coluna<T>[];
  className?: string;
}

function escaparCSV(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  const s = String(valor);
  // Sempre envolve em aspas se contem ; " ou newline
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function ExportarCSV<T>({ nomeArquivo, linhas, colunas, className = '' }: Props<T>) {
  const baixar = () => {
    const sep = ';';
    const header = colunas.map(c => escaparCSV(c.titulo)).join(sep);
    const corpo = linhas
      .map(linha => colunas.map(c => escaparCSV(c.valor(linha))).join(sep))
      .join('\n');
    // BOM UTF-8 pra Excel reconhecer acentos
    const csv = '﻿' + header + '\n' + corpo;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dataStr = new Date().toISOString().slice(0, 10);
    a.download = `${nomeArquivo}_${dataStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (linhas.length === 0) return null;

  return (
    <button
      onClick={baixar}
      className={`text-xs text-gray-400 hover:text-indigo-300 border border-gray-700 hover:border-indigo-700 px-2 py-1 rounded transition ${className}`}
      title={`Baixar ${linhas.length} linhas em CSV`}
    >
      ⬇ CSV
    </button>
  );
}
