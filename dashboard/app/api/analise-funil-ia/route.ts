import { NextResponse, NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface ParametrosFunil {
  origem: string;
  unidade: string;
  periodo: string;
  agendados: number;
  compareceram: number;
  pagaram: number;
  receita: number;
  taxa_agend_comp: number | null; // 0-1
  taxa_comp_pag: number | null; // 0-1
  media_geral_agend_comp: number | null; // 0-1
  media_geral_comp_pag: number | null; // 0-1
}

function hashParametros(p: ParametrosFunil): string {
  // Arredonda receita pra centavos pra cache nao quebrar por flutuacao
  const norm = {
    o: p.origem,
    u: p.unidade,
    p: p.periodo,
    a: p.agendados,
    c: p.compareceram,
    pg: p.pagaram,
    r: Math.round(p.receita * 100),
    tac: p.taxa_agend_comp != null ? Math.round(p.taxa_agend_comp * 1000) : null,
    tcp: p.taxa_comp_pag != null ? Math.round(p.taxa_comp_pag * 1000) : null,
    mac: p.media_geral_agend_comp != null ? Math.round(p.media_geral_agend_comp * 1000) : null,
    mcp: p.media_geral_comp_pag != null ? Math.round(p.media_geral_comp_pag * 1000) : null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

function pct(v: number | null): string {
  if (v == null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

function montarPrompt(p: ParametrosFunil): string {
  const tacPct = pct(p.taxa_agend_comp);
  const tcpPct = pct(p.taxa_comp_pag);
  const macPct = pct(p.media_geral_agend_comp);
  const mcpPct = pct(p.media_geral_comp_pag);

  return `Analise os números do funil de conversão da campanha "${p.origem}" da unidade ${p.unidade} no período "${p.periodo}".

DADOS DA CAMPANHA:
- Agendados: ${p.agendados}
- Compareceram: ${p.compareceram} (taxa: ${tacPct})
- Pagaram: ${p.pagaram} (taxa de quem compareceu: ${tcpPct})
- Receita: R$ ${p.receita.toFixed(2).replace('.', ',')}

MÉDIA GERAL DA UNIDADE (todas as campanhas):
- Taxa Agendamento → Comparecimento: ${macPct}
- Taxa Comparecimento → Pagamento: ${mcpPct}

INSTRUÇÕES:
Gere uma análise EXATAMENTE no formato abaixo, com 3 blocos separados por linha em branco. Use português do Brasil, tom profissional e direto. Seja conciso (máximo 2 linhas por bloco).

🔴 **Pior etapa: [nome da etapa] ([valor]%)**
[Frase explicando o gargalo. Compare com a média da unidade. Cite "${p.origem}" pelo nome.]

💰 **[Título do ponto positivo ou alerta financeiro]**
[Frase com observação financeira ou de conversão. Compare com média.]

🎯 **Recomendação**: [ação prática e específica em 1 frase]

REGRAS:
- Use exatamente os emojis 🔴 💰 🎯 (não outros)
- Negrito com **texto**
- Não invente números — use só os fornecidos
- Se algum número for 0, NÃO calcule taxa (use "—")
- Se receita = 0 mas tem pagos, alerte sobre dado faltando
- Pra "pior etapa": é a com taxa mais baixa quando comparada à média (ou pior absoluto se sem média)
- Não use bullets, só os 3 blocos com emoji`;
}

async function chamarClaude(prompt: string): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const resposta = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = resposta.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Resposta da IA sem texto');
  }
  return textBlock.text.trim();
}

async function buscarCache(hash: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('cache_analise_ia')
      .select('texto')
      .eq('hash', hash)
      .maybeSingle();
    if (error) return null;
    return data?.texto ?? null;
  } catch {
    return null;
  }
}

async function gravarCache(
  hash: string,
  origem: string,
  parametros: ParametrosFunil,
  texto: string,
): Promise<void> {
  try {
    await supabase.from('cache_analise_ia').upsert(
      {
        hash,
        origem,
        unidade_id: null,
        parametros: parametros as any,
        texto,
        modelo: 'claude-haiku-4-5',
      },
      { onConflict: 'hash' },
    );
  } catch (e) {
    // Tabela ainda nao existe — log e ignora
    console.warn('[analise-ia] cache_analise_ia nao existe — pulando insert', e);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error:
            'ANTHROPIC_API_KEY não configurada. Adicione a variável no Vercel pra ativar análises de IA.',
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as ParametrosFunil;
    if (!body.origem || body.agendados == null) {
      return NextResponse.json({ error: 'parametros incompletos' }, { status: 400 });
    }

    const hash = hashParametros(body);

    // 1. Tenta cache
    const cached = await buscarCache(hash);
    if (cached) {
      return NextResponse.json({ texto: cached, cache: true });
    }

    // 2. Chama IA
    const prompt = montarPrompt(body);
    const texto = await chamarClaude(prompt);

    // 3. Grava no cache (best-effort)
    await gravarCache(hash, body.origem, body, texto);

    return NextResponse.json({ texto, cache: false });
  } catch (e) {
    console.error('Erro em /api/analise-funil-ia:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
