/**
 * Helpers de manipulacao de periodos.
 *
 * Como CampanhasReport eh um SNAPSHOT mensal (data_relatorio = 1o dia do mes
 * de referencia), filtros parciais (ex: 15/04 a 15/05) precisam expandir
 * pra cobrir os meses INTEIROS que tocam o range — senao a query nao acha
 * o snapshot.
 */

export function expandirParaMesesInteiros(
  dataInicio: string | null | undefined,
  dataFim: string | null | undefined,
): { inicio: string | null; fim: string | null } {
  if (!dataInicio || !dataFim) return { inicio: dataInicio || null, fim: dataFim || null };

  const di = new Date(`${dataInicio}T12:00:00`);
  const df = new Date(`${dataFim}T12:00:00`);
  if (isNaN(di.getTime()) || isNaN(df.getTime())) {
    return { inicio: dataInicio, fim: dataFim };
  }

  // Primeiro dia do mes do inicio
  const inicioMes = new Date(di.getFullYear(), di.getMonth(), 1);
  // Ultimo dia do mes do fim
  const fimMes = new Date(df.getFullYear(), df.getMonth() + 1, 0);

  return {
    inicio: inicioMes.toISOString().slice(0, 10),
    fim: fimMes.toISOString().slice(0, 10),
  };
}

/**
 * Verifica se o periodo precisou ser expandido (ou seja, o original nao
 * comecava no 1o dia do mes ou nao terminava no ultimo).
 */
export function periodoFoiExpandido(
  original: { inicio: string | null; fim: string | null },
  expandido: { inicio: string | null; fim: string | null },
): boolean {
  return original.inicio !== expandido.inicio || original.fim !== expandido.fim;
}
