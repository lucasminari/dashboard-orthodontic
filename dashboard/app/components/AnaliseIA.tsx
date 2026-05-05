'use client';

import { useEffect, useState } from 'react';

interface Props {
  origem: string;
  unidade: string;
  periodo: string;
  agendados: number;
  compareceram: number;
  pagaram: number;
  receita: number;
  taxaAgendComp: number | null;
  taxaCompPag: number | null;
  mediaAgendComp: number | null;
  mediaCompPag: number | null;
  /** compacto = fonte menor pra cards de campanha */
  compacto?: boolean;
}

/**
 * Analise gerada por IA (Claude) do funil de uma campanha.
 * Faz fetch quando os parametros mudam, com cache no servidor por hash.
 */
export function AnaliseIA(props: Props) {
  const [texto, setTexto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Sem dados suficientes, nao chama IA
    if (props.agendados === 0 && props.compareceram === 0 && props.pagaram === 0) {
      setTexto(null);
      setCarregando(false);
      return;
    }

    let cancelado = false;
    setCarregando(true);
    setErro(null);

    fetch('/api/analise-funil-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origem: props.origem,
        unidade: props.unidade,
        periodo: props.periodo,
        agendados: props.agendados,
        compareceram: props.compareceram,
        pagaram: props.pagaram,
        receita: props.receita,
        taxa_agend_comp: props.taxaAgendComp,
        taxa_comp_pag: props.taxaCompPag,
        media_geral_agend_comp: props.mediaAgendComp,
        media_geral_comp_pag: props.mediaCompPag,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelado) return;
        if (data.error) setErro(data.error);
        else setTexto(data.texto);
      })
      .catch(e => {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : 'Erro ao gerar análise');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [
    props.origem,
    props.unidade,
    props.periodo,
    props.agendados,
    props.compareceram,
    props.pagaram,
    props.receita,
    props.taxaAgendComp,
    props.taxaCompPag,
    props.mediaAgendComp,
    props.mediaCompPag,
  ]);

  const cls = props.compacto ? 'text-xs' : 'text-sm';

  if (carregando) {
    return (
      <div className={`bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-4 ${cls}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-indigo-400">🧠</span>
          <span className="text-indigo-300 font-semibold text-xs uppercase tracking-wider">Análise IA</span>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-indigo-900/40 rounded animate-pulse w-3/4"></div>
          <div className="h-3 bg-indigo-900/40 rounded animate-pulse"></div>
          <div className="h-3 bg-indigo-900/40 rounded animate-pulse w-5/6"></div>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className={`bg-gray-900/50 border border-gray-800 rounded-lg p-4 ${cls}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-gray-500">🧠</span>
          <span className="text-gray-500 font-semibold text-xs uppercase tracking-wider">Análise IA</span>
        </div>
        <p className="text-gray-500 text-xs italic">{erro}</p>
      </div>
    );
  }

  if (!texto) {
    return (
      <div className={`bg-gray-900/40 border border-gray-800 rounded-lg p-4 ${cls}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-gray-600">🧠</span>
          <span className="text-gray-600 font-semibold text-xs uppercase tracking-wider">Análise IA</span>
        </div>
        <p className="text-gray-600 text-xs italic">Sem dados suficientes pra analisar.</p>
      </div>
    );
  }

  // Renderiza texto: mantém quebras de linha + bold com **
  const linhas = texto.split('\n');

  return (
    <div className={`bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-4 ${cls} space-y-2`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-indigo-400">🧠</span>
        <span className="text-indigo-300 font-semibold text-xs uppercase tracking-wider">Análise IA</span>
      </div>
      <div className="space-y-2 text-gray-200 leading-relaxed">
        {linhas.map((l, i) => {
          const trimmed = l.trim();
          if (!trimmed) return null;
          return (
            <p
              key={i}
              dangerouslySetInnerHTML={{
                __html: trimmed.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>'),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
