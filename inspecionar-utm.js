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
  // Pega 250 leads e conta quantos têm UTMs preenchidos
  const d = await fetchKommo(`/leads?filter[pipeline_id]=${PIPELINE}&limit=250&page=1`);
  const leads = d._embedded.leads;

  let comUTM = 0;
  let comDataAvaliacao = 0;
  const exemplosUTM = [];

  for (const l of leads) {
    const cfs = l.custom_fields_values || [];
    const temUTM = cfs.some(c => c.field_code?.startsWith('UTM_') && c.values?.[0]?.value);
    const temDataAval = cfs.some(c => c.field_id === 3090222 && c.values?.[0]?.value);
    if (temUTM) {
      comUTM++;
      if (exemplosUTM.length < 3) {
        exemplosUTM.push({
          id: l.id,
          utms: cfs.filter(c => c.field_code?.startsWith('UTM_'))
                   .map(c => `${c.field_code}=${c.values?.[0]?.value}`)
        });
      }
    }
    if (temDataAval) comDataAvaliacao++;
  }

  console.log(`Amostra: ${leads.length} leads`);
  console.log(`Com UTMs preenchidos: ${comUTM} (${(100*comUTM/leads.length).toFixed(1)}%)`);
  console.log(`Com Data da Avaliação: ${comDataAvaliacao} (${(100*comDataAvaliacao/leads.length).toFixed(1)}%)`);

  console.log('\nExemplos com UTM:');
  exemplosUTM.forEach(e => {
    console.log(`  Lead ${e.id}:`);
    e.utms.forEach(u => console.log(`    ${u}`));
  });
})();