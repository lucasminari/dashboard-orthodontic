require('dotenv').config();

const TOKEN = process.env.KOMMO_TOKEN;
const SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const PIPELINE = 13518920;

async function fetchKommo(path) {
  const r = await fetch(`https://${SUBDOMAIN}.kommo.com/api/v4${path}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

(async () => {
  // 1. Etapas (status) do pipeline
  console.log('=== ETAPAS DO PIPELINE 13518920 ===');
  const p = await fetchKommo(`/leads/pipelines/${PIPELINE}`);
  const etapas = p._embedded?.statuses || [];
  etapas.forEach(s => console.log(`  [${s.id}] ${s.name}  (sort: ${s.sort})`));

  // 2. Pega 1 lead da etapa CONSULTA AGENDADA pra ver campos custom
  console.log('\n=== 1 LEAD COM CAMPOS CUSTOM (qualquer etapa avançada) ===');
  // Tenta vários: pega 5 leads e procura um com custom_fields_values
  const d = await fetchKommo(`/leads?filter[pipeline_id]=${PIPELINE}&limit=20`);
  const leadComCustom = d._embedded.leads.find(l => l.custom_fields_values?.length > 0);
  if (leadComCustom) {
    console.log(`Lead ${leadComCustom.id} - ${leadComCustom.name}`);
    console.log(`  status_id: ${leadComCustom.status_id}`);
    leadComCustom.custom_fields_values.forEach(cf => {
      console.log(`  [${cf.field_id}] ${cf.field_name} (${cf.field_code || '-'}): ${JSON.stringify(cf.values)}`);
    });
  } else {
    console.log('  Nenhum dos 20 leads tem campos custom preenchidos.');
  }

  // 3. Lista os campos custom configurados pra leads na conta
  console.log('\n=== CAMPOS CUSTOM DEFINIDOS PARA LEADS ===');
  const cf = await fetchKommo(`/leads/custom_fields?limit=50`);
  const campos = cf._embedded?.custom_fields || [];
  campos.forEach(c => console.log(`  [${c.id}] ${c.name} (code: ${c.code || '-'}, type: ${c.type})`));
})();