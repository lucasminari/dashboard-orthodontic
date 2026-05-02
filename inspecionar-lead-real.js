require('dotenv').config();

const TOKEN = process.env.KOMMO_TOKEN;
const SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;

// IDs dos pipelines comerciais (Centro, Várzea, Hortolândia)
const PIPELINES_VENDA = [12725071, 13518920, 12871475];

(async () => {
  // Pega 1 lead de cada pipeline comercial
  for (const pid of PIPELINES_VENDA) {
    const url = `https://${SUBDOMAIN}.kommo.com/api/v4/leads?limit=1&filter[pipeline_id]=${pid}&with=contacts&order[created_at]=desc`;
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });

    if (r.status === 204) {
      console.log(`\n=== Pipeline ${pid}: SEM LEADS ===`);
      continue;
    }

    const d = await r.json();
    const lead = d._embedded?.leads?.[0];
    if (!lead) continue;

    console.log(`\n========== PIPELINE ${pid} ==========`);
    console.log('Lead id:', lead.id);
    console.log('name:', lead.name);
    console.log('status_id:', lead.status_id);
    console.log('created_at:', new Date(lead.created_at * 1000).toISOString().slice(0, 19));

    console.log('\nCampos custom do LEAD:');
    if (lead.custom_fields_values?.length) {
      lead.custom_fields_values.forEach(cf => {
        const valores = cf.values?.map(v => v.value).join(', ');
        console.log(`  [${cf.field_id}] ${cf.field_name}: ${valores}`);
      });
    } else {
      console.log('  (nenhum)');
    }

    const contactIds = lead._embedded?.contacts?.map(c => c.id) || [];
    if (contactIds.length === 0) {
      console.log('\nContatos: nenhum');
      continue;
    }

    const cUrl = `https://${SUBDOMAIN}.kommo.com/api/v4/contacts/${contactIds[0]}`;
    const cr = await fetch(cUrl, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    const c = await cr.json();

    console.log('\nContato:');
    console.log('  name:', c.name);
    console.log('  campos custom:');
    if (c.custom_fields_values?.length) {
      c.custom_fields_values.forEach(cf => {
        const valores = cf.values?.map(v => v.value).join(', ');
        console.log(`    [${cf.field_code || cf.field_name}] ${cf.field_name}: ${valores}`);
      });
    }
  }
})();