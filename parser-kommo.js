require('dotenv').config();
const { Client } = require('pg');

const TOKEN = process.env.KOMMO_TOKEN;
const SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const PIPELINE = 13518920;

// Tags que identificam UNIDADE
const TAGS_UNIDADE = {
  'centro': 1,
  'várzea': 2,
  'varzea': 2,
  'hortolândia': 3,
  'hortolandia': 3,
  'vinhedo': 3
};

// Tags que identificam ORIGEM/CAMPANHA
const TAGS_ORIGEM = new Set([
  'sorriso novo', 'dbout', 'mídia real', 'midia real',
  'mídia real - vp', 'midia real - vp', 'mídia real - vh', 'midia real - vh',
  'galú', 'galu', 'pitch yes', 'pitch'
]);

const FIELD_DATA_AVALIACAO = 3090222;

function normalizarTelefone(t) {
  if (!t) return null;
  const digitos = String(t).replace(/[^0-9]/g, '');
  if (digitos.length >= 11) return digitos.slice(-11);
  if (digitos.length >= 10) return digitos.slice(-10);
  return null;
}

async function fetchKommo(path) {
  const r = await fetch(`https://${SUBDOMAIN}.kommo.com/api/v4${path}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (r.status === 204) return null;
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return await r.json();
}

function classificarTags(tagsArr) {
  const nomes = (tagsArr || []).map(t => t.name?.toLowerCase().trim()).filter(Boolean);
  let unidade = null;
  let origens = [];
  for (const n of nomes) {
    if (TAGS_UNIDADE[n] && !unidade) unidade = TAGS_UNIDADE[n];
    if (TAGS_ORIGEM.has(n)) origens.push(n);
  }
  return { unidade, origem: origens[0] || null, todasTags: nomes };
}

function extrairDataAvaliacao(customFields) {
  if (!customFields) return null;
  const f = customFields.find(c => c.field_id === FIELD_DATA_AVALIACAO);
  const ts = f?.values?.[0]?.value;
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

async function buscarTelefones(contactIds) {
  const mapa = new Map();
  for (let i = 0; i < contactIds.length; i += 50) {
    const lote = contactIds.slice(i, i + 50);
    const params = lote.map(id => `filter[id][]=${id}`).join('&');
    const data = await fetchKommo(`/contacts?${params}&limit=50`);
    if (!data?._embedded?.contacts) continue;
    for (const c of data._embedded.contacts) {
      const f = c.custom_fields_values?.find(x => x.field_code === 'PHONE');
      mapa.set(c.id, normalizarTelefone(f?.values?.[0]?.value));
    }
  }
  return mapa;
}

async function executar() {
  if (!TOKEN || !SUBDOMAIN) {
    console.error('ERRO: KOMMO_TOKEN ou KOMMO_SUBDOMAIN não está no .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Conectado ao banco.');

  const inicio = Date.now();
  let pagina = 1;
  let totalProcessados = 0;
  let semTelefone = 0;
  let semUnidade = 0;
  const contadorEtapas = {};
  const contadorOrigens = {};
  const contadorUnidades = { 1: 0, 2: 0, 3: 0, 'sem': 0 };

  while (true) {
    const data = await fetchKommo(
      `/leads?filter[pipeline_id]=${PIPELINE}&with=contacts&limit=250&page=${pagina}`
    );
    if (!data?._embedded?.leads?.length) break;
    const leads = data._embedded.leads;

    // Buscar telefones em lote
    const contactIds = [];
    for (const l of leads) {
      const cid = l._embedded?.contacts?.[0]?.id;
      if (cid) contactIds.push(cid);
    }
    const mapaTelefones = await buscarTelefones(contactIds);

    for (const l of leads) {
      const cid = l._embedded?.contacts?.[0]?.id;
      const telNorm = cid ? mapaTelefones.get(cid) : null;
      const { unidade, origem, todasTags } = classificarTags(l._embedded?.tags);
      const dataAval = extrairDataAvaliacao(l.custom_fields_values);

      if (!telNorm) semTelefone++;
      if (!unidade) semUnidade++;
      contadorEtapas[l.status_id] = (contadorEtapas[l.status_id] || 0) + 1;
      contadorUnidades[unidade || 'sem']++;
      if (origem) contadorOrigens[origem] = (contadorOrigens[origem] || 0) + 1;

      // UPSERT em pacientes só se tiver telefone
      let pacienteId = null;
      if (telNorm) {
        const up = await client.query(
          `INSERT INTO pacientes (telefone_norm, nome_canonical, kommo_lead_id, primeiro_lead_em, primeira_unidade_id, primeira_origem)
           VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
           ON CONFLICT (telefone_norm) DO UPDATE
             SET nome_canonical = COALESCE(pacientes.nome_canonical, EXCLUDED.nome_canonical),
                 kommo_lead_id = COALESCE(pacientes.kommo_lead_id, EXCLUDED.kommo_lead_id),
                 primeira_unidade_id = COALESCE(pacientes.primeira_unidade_id, EXCLUDED.primeira_unidade_id),
                 primeira_origem = COALESCE(pacientes.primeira_origem, EXCLUDED.primeira_origem),
                 atualizado_em = NOW()
           RETURNING id`,
          [telNorm, l.name, l.id, l.created_at, unidade, origem]
        );
        pacienteId = up.rows[0].id;
      }

      // UPSERT em kommo_leads
      await client.query(
        `INSERT INTO kommo_leads (
           id, unidade_id, paciente_id, nome, telefone_norm,
           origem, campanha, etapa_atual, status, responsavel,
           data_avaliacao, tags,
           criado_em, atualizado_em, sincronizado_em
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11, $12,
           to_timestamp($13), to_timestamp($14), NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           unidade_id = EXCLUDED.unidade_id,
           paciente_id = COALESCE(EXCLUDED.paciente_id, kommo_leads.paciente_id),
           nome = EXCLUDED.nome,
           telefone_norm = EXCLUDED.telefone_norm,
           origem = EXCLUDED.origem,
           campanha = EXCLUDED.campanha,
           etapa_atual = EXCLUDED.etapa_atual,
           responsavel = EXCLUDED.responsavel,
           data_avaliacao = EXCLUDED.data_avaliacao,
           tags = EXCLUDED.tags,
           atualizado_em = EXCLUDED.atualizado_em,
           sincronizado_em = NOW()`,
        [
          l.id, unidade, pacienteId, l.name, telNorm,
          origem, origem, String(l.status_id), null, String(l.responsible_user_id || ''),
          dataAval, todasTags,
          l.created_at, l.updated_at
        ]
      );
      totalProcessados++;
    }

    const segs = Math.round((Date.now() - inicio) / 1000);
    console.log(`Página ${pagina}: ${leads.length} leads | total ${totalProcessados} | ${segs}s`);

    if (!data._links?.next) break;
    pagina++;
  }

  await client.end();
  const tempoMin = ((Date.now() - inicio) / 60000).toFixed(1);

  console.log(`\n=== CONCLUÍDO ===`);
  console.log(`Total: ${totalProcessados} leads em ${tempoMin} min`);
  console.log(`Sem telefone:  ${semTelefone} (${(100*semTelefone/totalProcessados).toFixed(0)}%)`);
  console.log(`Sem unidade:   ${semUnidade} (${(100*semUnidade/totalProcessados).toFixed(0)}%)`);
  console.log(`\nDistribuição por unidade:`);
  console.log(`  Centro:       ${contadorUnidades[1]}`);
  console.log(`  Várzea:       ${contadorUnidades[2]}`);
  console.log(`  Hortolândia:  ${contadorUnidades[3]}`);
  console.log(`  Sem unidade:  ${contadorUnidades['sem']}`);
  console.log(`\nDistribuição por origem (top):`);
  Object.entries(contadorOrigens).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([o,q]) => {
    console.log(`  ${q.toString().padStart(4)} - ${o}`);
  });
}

executar().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});