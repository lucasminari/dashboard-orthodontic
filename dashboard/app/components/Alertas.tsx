'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Alerta = {
  tipo: 'sucesso' | 'atencao' | 'critico';
  titulo: string;
  detalhe: string;
  link?: string;
};

interface Props {
  unidadeId?: number;
}

const KOMMO = ['Mídia Real', 'DBOUT', 'PitchYes', 'Sorriso Novo', 'Galú'];

export function Alertas({ unidadeId }: Props) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  useEffect(() => {
    async function carregar() {
      try {
        const params = new URLSearchParams();
        if (unidadeId) params.set('unidade_id', String(unidadeId));
        const res = await fetch(`/api/tendencia-origens?${params.toString()}`);
        const json = await res.json();
        if (!json.origens) return;

        const lista: Alerta[] = [];
        for (const [origem, info] of Object.entries(json.origens) as [string, { serie: number[]; variacao: number | null }][]) {
          const ult = info.serie[info.serie.length - 1] || 0;
          if (info.variacao !== null) {
            // Alta de 30%+ em campanha relevante
            if (info.variacao >= 0.3 && ult >= 5) {
              lista.push({
                tipo: 'sucesso',
                titulo: `📈 ${origem}: +${(info.variacao * 100).toFixed(0)}% vs mês anterior`,
                detalhe: `${ult} cadastrados este mês.`,
                link: `/origem/${encodeURIComponent(origem)}`,
              });
            }
            // Queda de 30%+ em campanha relevante
            if (info.variacao <= -0.3 && info.serie[info.serie.length - 2] >= 5) {
              lista.push({
                tipo: 'critico',
                titulo: `📉 ${origem}: ${(info.variacao * 100).toFixed(0)}% vs mês anterior`,
                detalhe: `Caiu de ${info.serie[info.serie.length - 2]} para ${ult} cadastrados.`,
                link: `/origem/${encodeURIComponent(origem)}`,
              });
            }
          }
          // Campanha Kommo zerou este mes
          if (KOMMO.includes(origem) && ult === 0 && (info.serie[info.serie.length - 2] || 0) > 0) {
            lista.push({
              tipo: 'atencao',
              titulo: `⚠️ ${origem}: 0 cadastros este mês`,
              detalhe: `Tinha ${info.serie[info.serie.length - 2]} mês passado. Verificar se a campanha está ativa.`,
              link: `/origem/${encodeURIComponent(origem)}`,
            });
          }
        }

        // Ordena: criticos primeiro, depois atencao, depois sucesso
        const ordem = { critico: 0, atencao: 1, sucesso: 2 };
        lista.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);

        setAlertas(lista.slice(0, 5)); // Top 5
      } catch {
        // ignore
      }
    }
    carregar();
  }, [unidadeId]);

  if (alertas.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
        Alertas e destaques do mês
      </h2>
      <div className="space-y-2">
        {alertas.map((a, i) => {
          const cor =
            a.tipo === 'critico'
              ? 'border-red-700/60 bg-red-950/30 text-red-200'
              : a.tipo === 'atencao'
                ? 'border-amber-700/60 bg-amber-950/30 text-amber-200'
                : 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200';
          const conteudo = (
            <div className={`border ${cor} rounded p-3 text-sm`}>
              <div className="font-medium">{a.titulo}</div>
              <div className="text-xs opacity-80 mt-0.5">{a.detalhe}</div>
            </div>
          );
          return a.link ? (
            <Link key={i} href={a.link} className="block hover:opacity-80 transition">
              {conteudo}
            </Link>
          ) : (
            <div key={i}>{conteudo}</div>
          );
        })}
      </div>
    </div>
  );
}
