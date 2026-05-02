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
  const lower = filename.toLowerCase();
  if (lower.includes('leads')) return 'leads';
  if (lower.includes('sistema') || lower.includes('contrato')) return 'sistema';
  if (lower.includes('performance')) return 'performance';
  if (lower.includes('campanha') || lower.includes('campaign')) return 'campanhas';
  return null;
}

function obterDataHoje(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
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
    const tipos: Set<string> = new Set();

    // Processar arquivos
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        const filename = value.name;
        const tipo = extrairTipo(filename);
        const ext = extrairExtensao(filename);

        if (!tipo) {
          return NextResponse.json(
            { error: `Não consegui identificar o tipo do arquivo: ${filename}. Certifique-se que o arquivo contém 'leads', 'sistema', 'performance' ou 'campanhas' no nome.` },
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

    const dataRelatorio = obterDataHoje();

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
