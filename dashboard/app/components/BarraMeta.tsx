'use client';

interface Props {
  realizado: number;
  meta: number;
  ehMoeda?: boolean;
}

function fmt(n: number, ehMoeda = false): string {
  if (ehMoeda) return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString('pt-BR');
}

/** Barra de progresso meta vs realizado.
 *  - Vermelho: <50% da meta
 *  - Amarelo: 50-89%
 *  - Verde: >=90%
 */
export function BarraMeta({ realizado, meta, ehMoeda = false }: Props) {
  if (!meta || meta <= 0) return null;

  const pct = realizado / meta;
  const pctClamped = Math.min(pct, 1);
  const pctOver = pct > 1 ? pct - 1 : 0; // excede meta
  const cor =
    pct >= 0.9 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-500' : 'bg-red-500';
  const corTxt =
    pct >= 0.9 ? 'text-emerald-300' : pct >= 0.5 ? 'text-amber-300' : 'text-red-300';

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between text-[10px] mb-0.5">
        <span className="text-gray-500">Meta {fmt(meta, ehMoeda)}</span>
        <span className={`font-medium ${corTxt}`}>{(pct * 100).toFixed(0)}%</span>
      </div>
      <div className="bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${cor} transition-all`}
          style={{ width: `${pctClamped * 100}%` }}
        />
        {pctOver > 0 && (
          <div
            className="absolute h-1.5 rounded-full bg-emerald-300/50"
            style={{ width: `${Math.min(pctOver, 0.5) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
