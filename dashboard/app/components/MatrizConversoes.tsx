'use client';

interface Etapa {
  label: string;
  curto: string;
  valor: number;
}

interface Props {
  agendados: number;
  compareceram: number;
  fecharam: number;
  pagaram: number;
  /** Tamanho compacto pra cards menores */
  compacto?: boolean;
}

function corPorTaxa(taxa: number): string {
  if (taxa >= 0.6) return 'text-emerald-400';
  if (taxa >= 0.3) return 'text-amber-400';
  if (taxa >= 0.1) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Matriz triangular mostrando a taxa de conversao entre cada par de etapas.
 * Ex: Cadastrados → Pagaram = 64%
 *
 * Ajuda a ler o funil de forma completa, nao so entre etapas adjacentes.
 */
export function MatrizConversoes({
  agendados,
  compareceram,
  fecharam,
  pagaram,
  compacto = false,
}: Props) {
  const etapas: Etapa[] = [
    { label: 'Agendados', curto: 'Agend.', valor: agendados },
    { label: 'Compareceram', curto: 'Compar.', valor: compareceram },
    { label: 'Fecharam', curto: 'Fech.', valor: fecharam },
    { label: 'Pagaram', curto: 'Pag.', valor: pagaram },
  ];

  return (
    <div className={`mt-4 pt-4 border-t border-gray-800 ${compacto ? 'text-xs' : 'text-sm'}`}>
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className={`font-semibold text-gray-200 ${compacto ? 'text-xs' : 'text-sm'}`}>
          Conversões completas
        </h3>
        <span className="text-[10px] text-gray-500">
          % de cada etapa que avançou até cada etapa seguinte
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className={`w-full ${compacto ? 'text-[10px]' : 'text-xs'}`}>
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-normal pr-2 pb-2">De / Para</th>
              {etapas.slice(1).map(e => (
                <th key={e.label} className="text-right font-normal pl-2 pb-2 whitespace-nowrap">
                  {e.curto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {etapas.slice(0, -1).map((origem, i) => (
              <tr key={origem.label} className="border-t border-gray-800/50">
                <td className="text-gray-400 pr-2 py-1.5 whitespace-nowrap">
                  {origem.curto}{' '}
                  <span className="text-gray-600 tabular-nums">({origem.valor})</span>
                </td>
                {etapas.slice(1).map((destino, j) => {
                  const indiceDestino = j + 1;
                  const indiceOrigem = i;
                  if (indiceDestino <= indiceOrigem) {
                    // Celula abaixo da diagonal — vazia
                    return <td key={destino.label} className="text-right py-1.5 pl-2 text-gray-700">·</td>;
                  }
                  const taxa = origem.valor > 0 ? destino.valor / origem.valor : null;
                  if (taxa === null) {
                    return (
                      <td key={destino.label} className="text-right py-1.5 pl-2 text-gray-700">
                        —
                      </td>
                    );
                  }
                  const pct = (taxa * 100).toFixed(0);
                  const cor = corPorTaxa(Math.min(taxa, 1));
                  return (
                    <td
                      key={destino.label}
                      className={`text-right py-1.5 pl-2 tabular-nums ${cor}`}
                      title={`${destino.valor} de ${origem.valor} ${origem.label.toLowerCase()}`}
                    >
                      {pct}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-gray-600 flex items-center gap-3 flex-wrap">
        <span>Legenda:</span>
        <span className="text-emerald-400">≥60%</span>
        <span className="text-amber-400">30-59%</span>
        <span className="text-orange-400">10-29%</span>
        <span className="text-red-400">&lt;10%</span>
      </div>
    </div>
  );
}
