'use client';

import { useEffect, useState } from 'react';

type TipoIngestao = 'leads' | 'sistema' | 'performance';

type RespostaApi = {
  unidade_id: number | null;
  tipos: Record<string, { concluido_em: string; data_relatorio: string } | null>;
  agora: string;
};

interface Props {
  /** Tipos de dados que o quadro usa. A data mostrada eh a MAIS ANTIGA entre eles. */
  tipos: TipoIngestao[];
  /** unidade_id (0 ou undefined = todas as unidades, mostra a unidade mais defasada) */
  unidadeId?: number;
  /** Compacto = sem icone, fonte menor (pra dentro de cards) */
  compacto?: boolean;
  /** Forca refetch quando muda (ex: depois de novo upload) */
  trigger?: number;
}

function formatarRelativo(iso: string): string {
  const data = new Date(iso);
  const agora = new Date();
  const segs = Math.floor((agora.getTime() - data.getTime()) / 1000);
  if (segs < 60) return 'agora há pouco';
  const mins = Math.floor(segs / 60);
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const dias = Math.floor(hrs / 24);
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return data.toLocaleDateString('pt-BR');
}

function formatarAbsoluto(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function AtualizadoEm({ tipos, unidadeId, compacto = false, trigger }: Props) {
  const [dados, setDados] = useState<RespostaApi | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (unidadeId) params.set('unidade_id', String(unidadeId));
    fetch(`/api/ultima-atualizacao?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setErro(d.error);
        else setDados(d);
      })
      .catch(e => setErro(e.message));
  }, [unidadeId, trigger]);

  if (erro) return null;
  if (!dados) {
    return (
      <span className={compacto ? 'text-[10px] text-gray-600' : 'text-xs text-gray-500'}>
        ...
      </span>
    );
  }

  // Pega a data MAIS ANTIGA entre os tipos solicitados.
  const datas = tipos
    .map(t => dados.tipos[t]?.concluido_em)
    .filter((x): x is string => !!x);

  if (datas.length === 0) {
    return (
      <span className={compacto ? 'text-[10px] text-gray-600' : 'text-xs text-gray-500'}>
        Sem dados importados
      </span>
    );
  }

  const maisAntiga = datas.sort()[0];
  const relativo = formatarRelativo(maisAntiga);
  const absoluto = formatarAbsoluto(maisAntiga);

  // Identifica se tem tipo desatualizado (mais de 24h)
  const horas = (Date.now() - new Date(maisAntiga).getTime()) / 1000 / 3600;
  const desatualizado = horas > 36; // mais de 1.5 dia

  if (compacto) {
    return (
      <span
        className={`text-[10px] ${desatualizado ? 'text-amber-400' : 'text-gray-500'}`}
        title={`Atualização manual (não é tempo real). Última: ${absoluto}`}
      >
        {desatualizado && '⚠ '}
        Atualizado {relativo}
      </span>
    );
  }

  return (
    <span
      className={`text-xs ${desatualizado ? 'text-amber-400' : 'text-gray-500'} flex items-center gap-1`}
      title={`Atualização manual (não é tempo real). Última: ${absoluto}`}
    >
      {desatualizado ? '⚠️' : '🔄'}
      <span>Atualizado {relativo}</span>
    </span>
  );
}
