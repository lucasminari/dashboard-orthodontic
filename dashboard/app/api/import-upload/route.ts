import { NextResponse, NextRequest } from 'next/server';
import { processarArquivos } from '@/lib/parsers';

export const dynamic = 'force-dynamic';

const TIPOS_ESPERADOS = ['leads', 'sistema', 'performance', 'campanhas'];
const EXTENSOES_VALIDAS: Record<string, string[]> = {
  leads: ['xlsx'],
  sistema: ['xlsx'],
  performance: ['csv', 'xlsx'],
  campanhas: ['xlsx'],
};

function extrairTipo(filename: string): string | null {
  // Espera: YYYY-MM-DD_<tipo>.<ext>
  const match = filename.match(/^\d{4}-\d{2}-\d{2}_(\w+)\./);
  return match ? match[1] : null;
}

function extrairData(filename: string): string | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})_/);
  return match ? match[1] : null;
}

function extrairExtensao(filename: string): string {
  const parts = filename.split('.');
  return parts[parts.length - 1]?.toLowerCase() || '';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const unidadeId = formData.get('unidade_id') as string;

    if (!unidadeId) {
      return NextResponse.json({ error: 'unidade_id obrigatório' }, { status: 400 });
    }

    const files: Record<string, File> = {};
    const datas: Set<string> = new Set();
    const tipos: Set<string> = new Set();

    // Processar arquivos
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        const filename = value.name;
        const tipo = extrairTipo(filename);
        const data = extrairData(filename);
        const ext = extrairExtensao(filename);

        if (!tipo || !data) {
          return NextResponse.json(
            { error: `Nome de arquivo inválido: ${filename}. Esperado: YYYY-MM-DD_<tipo>.<ext>` },
            { status: 400 },
          );
        }

        if (!TIPOS_ESPERADOS.includes(tipo)) {
          return NextResponse.json(
            { error: `Tipo inválido: ${tipo}. Esperado: leads, sistema, performance ou campanhas` },
            { status: 400 },
          );
        }

        if (!EXTENSOES_VALIDAS[tipo].includes(ext)) {
          return NextResponse.json(
            { error: `Extensão inválida para ${tipo}: ${ext}. Esperado: ${EXTENSOES_VALIDAS[tipo].join(', ')}` },
            { status: 400 },
          );
        }

        files[tipo] = value;
        datas.add(data);
        tipos.add(tipo);
      }
    }

    // Validar que tem todos 4 tipos
    const tiposFaltando = TIPOS_ESPERADOS.filter((t) => !tipos.has(t));
    if (tiposFaltando.length > 0) {
      return NextResponse.json(
        { error: `Faltam arquivos: ${tiposFaltando.join(', ')}` },
        { status: 400 },
      );
    }

    // Validar que todas as datas são iguais
    if (datas.size > 1) {
      return NextResponse.json(
        { error: `Datas inconsistentes: ${Array.from(datas).join(', ')}. Todos os arquivos devem ter a mesma data.` },
        { status: 400 },
      );
    }

    const dataRelatorio = Array.from(datas)[0];

    // Processar arquivos
    const resultado = await processarArquivos(
      {
        leads: files.leads,
        sistema: files.sistema,
        performance: files.performance,
        campanhas: files.campanhas,
      },
      dataRelatorio,
      parseInt(unidadeId),
    );

    if (!resultado.success) {
      return NextResponse.json({ error: resultado.error || 'Erro ao processar' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data_relatorio: dataRelatorio,
      unidade_id: parseInt(unidadeId),
      processed: resultado.processed,
    });
  } catch (error) {
    console.error('Erro em /api/import-upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 },
    );
  }
}
