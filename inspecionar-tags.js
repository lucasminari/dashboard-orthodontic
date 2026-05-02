require('dotenv').config();

const TOKEN = process.env.KOMMO_TOKEN;
const SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const PIPELINE_PRINCIPAL = 13518920;

async function fetchKommo(path) {
  const r = await fetch(`https://${SUBDOMAIN}.kommo.com/api/v4${path}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

(async () => {
  // 1. Quantos leads tem o pipeline principal?
  console.log('=== Pipeline principal: contagem ===');
  let total = 0, pagina = 1;
  while (true) {
    const d = await fetchKommo(`/leads?filter[pipeline_id]=${PIPELINE_PRINCIPAL}&limit=250&page=${pagina}`);
    if (!d?._embedded?.leads?.length) break;
    total += d._embedded.leads.length;
    if (!d._links?.next) break;
    pagina++;
    if (pagina > 30) { console.log('  (parando após 30 páginas)'); break; }
  }
  console.log(`Total no pipeline ${PIPELINE_PRINCIPAL}: ${total} leads`);

  // 2. Inspeciona 3 leads do pipeline principal — vê estrutura de tags
  console.log('\n=== Estrutura de TAGS em 3 leads ===');
  const d = await fetchKommo(`/leads?filter[pipeline_id]=${PIPELINE_PRINCIPAL}&limit=3&with=contacts`);
  for (const lead of d._embedded.leads) {
    console.log(`\nLead ${lead.id} - "${lead.name}"`);
    const tags = lead._embedded?.tags || [];
    console.log(`  tags (${tags.length}):`);
    tags.forEach(t => console.log(`    [${t.id}] ${t.name}`));
  }

  // 3. Lista TODAS as tags da conta (pra ver os IDs das 3 unidades)
  console.log('\n=== Todas as tags de leads na conta ===');
  const tagsResp = await fetchKommo(`/leads/tags?limit=250`);
  const tags = tagsResp?._embedded?.tags || [];
  console.log(`Total de tags: ${tags.length}`);
  tags.forEach(t => console.log(`  [${t.id}] ${t.name}`));
})();