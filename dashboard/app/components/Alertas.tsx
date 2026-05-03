'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Alerta = {
  tipo: 'sucesso' | 'atencao' | 'critico';
  origem: string;
  pct: number; // variacao decimal (-1 = -100%, +0.5 = +50%)
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
          const pen = info.serie[info.serie.length - 2] || 0;
          if (info.variacao !== null) {
            // Alta de 30%+ em campanha relevante
            if (info.variacao >= 0.3 && ult >= 5) {
              lista.push({
                tipo: 'sucesso',
                origem,
                pct: info.variacao,
                detalhe: `${pen} → ${ult} cadastros`,
                link: `/origem/${encodeURIComponent(origem)}`,
              });
            }
            // Queda de 30%+ em campanha relevante
            if (info.variacao <= -0.3 && pen >= 5) {
              lista.push({
                tipo: 'critico',
                origem,
                pct: info.variacao,
                detalhe: `${pen} → ${ult} cadastros`,
                link: `/origem/${encodeURIComponent(origem)}`,
              });
            }
          }
          // Campanha Kommo zerou este mes
          if (KOMMO.includes(origem) && ult === 0 && pen > 0 && info.variacao !== -1) {
            lista.push({
              tipo: 'atencao',
              origem,
              pct: -1,
              detalhe: `${pen} → 0 cadastros — verificar campanha`,
              link: `/origem/${encodeURIComponent(origem)}`,
            });
          }
        }

        // Deduplica: se mesma origem aparece em critico e atencao, mantem critico
        const vistos = new Map<string, Alerta>();
        const ordem = { critico: 0, atencao: 1, sucesso: 2 };
        for (const a of lista) {
          const ex = vistos.get(a.origem);
          if (!ex || ordem[a.tipo] < ordem[ex.tipo]) {
            vistos.set(a.origem, a);
          }
        }
        const finais = Array.from(vistos.values()).sort((a, b) => {
          const dif = ordem[a.tipo] - ordem[b.tipo];
          if (dif !== 0) return dif;
          return Math.abs(b.pct) - Math.abs(a.pct);
        });

        setAlertas(finais);
      } catch {
        // ignore
      }
    }
    carregar();
  }, [unidadeId]);

  if (alertas.length === 0) return null;

  // Filtra "Sem origem" pra nao gerar alerta de algo que so a equipe pode arrumar
  const visiveis = alertas.filter(a => a.origem !== 'Sem origem');
  if (visiveis.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-gray-500 mr-1">
        Alertas
      </span>
      {visiveis.map((a, i) => {
        const cor =
          a.tipo === 'critico'
            ? 'border-red-700/50 bg-red-950/40 text-red-300 hover:bg-red-950/60'
            : a.tipo === 'atencao'
              ? 'border-amber-700/50 bg-amber-950/40 text-amber-300 hover:bg-amber-950/60'
              : 'border-emerald-700/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60';
        const icone = a.tipo === 'critico' ? '↓' : a.tipo === 'atencao' ? '⚠' : '↑';
        const pctStr = `${a.pct >= 0 ? '+' : ''}${(a.pct * 100).toFixed(0)}%`;
        const conteudo = (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${cor} transition cursor-pointer`}
            title={`${a.origem}: ${a.detalhe}`}
          >
            <span className="font-bold text-sm leading-none">{icone}</span>
            <span className="font-medium">{a.origem}</span>
            <span className="opacity-70">{pctStr}</span>
          </span>
        );
        return a.link ? (
          <Link key={i} href={a.link}>
            {conteudo}
          </Link>
        ) : (
          <span key={i}>{conteudo}</span>
        );
      })}
    </div>
  );
}
