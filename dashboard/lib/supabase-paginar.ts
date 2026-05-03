import { supabase } from './supabase';

/**
 * Busca TODAS as linhas de uma tabela usando paginacao automatica.
 * O Supabase tem limite default de 1000 linhas por query — sem paginar,
 * voce silenciosamente perde dados quando ha mais que isso.
 *
 * Uso:
 *   const linhas = await buscarTudo('raw_sistema', q =>
 *     q.select('*').eq('unidade_id', 1)
 *   );
 */
export async function buscarTudo<T = any>(
  tabela: string,
  configurar: (q: any) => any,
  pageSize = 1000,
): Promise<T[]> {
  const acumulado: T[] = [];
  let offset = 0;
  while (true) {
    const query = configurar(supabase.from(tabela)).range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    acumulado.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
    // Seguranca: limite de 100k linhas
    if (offset > 100_000) break;
  }
  return acumulado;
}
