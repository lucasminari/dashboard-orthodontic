require('dotenv').config();

const TOKEN = process.env.KOMMO_TOKEN;
const SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;

(async () => {
  // Pega 1 lead com contatos e campos custom
  const url = `https://${SUBDOMAIN}.kommo.com/api/v4/leads?limit=1&with=contacts`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const d = await r.json();
  const lead = d._embedded?.leads?.[0];

  if (!lead) {
    console.log('Nenhum lead retornado.');
    return;
  }

  console.log('=== ESTRUTURA DO LEAD ===');
  console.log('id:', lead.id);
  console.log('name:', lead.name);
  console.log('pipeline_id:', lead.pipeline_id);
  console.log('status_id:', lead.status_id);
  console.log('responsible_user_id:', lead.responsible_user_id);
  console.log('created_at:', new Date(lead.created_at * 1000).toISOString());

  console.log('\n=== CAMPOS CUSTOM DO LEAD ===');
  if (lead.custom_fields_values) {
    lead.custom_fields_values.forEach(cf => {
      console.log(`  ${cf.field_name}: ${JSON.stringify(cf.values)}`);
    });
  } else {
    console.log('  (nenhum)');
  }

  console.log('\n=== CONTATOS DO LEAD ===');
  const contactIds = lead._embedded?.contacts?.map(c => c.id) || [];
  console.log('contact_ids:', contactIds);

  if (contactIds.length > 0) {
    const cUrl = `https://${SUBDOMAIN}.kommo.com/api/v4/contacts/${contactIds[0]}`;
    const cr = await fetch(cUrl, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    const c = await cr.json();
    console.log('\n=== ESTRUTURA DO CONTATO ===');
    console.log('name:', c.name);
    console.log('campos custom:');
    if (c.custom_fields_values) {
      c.custom_fields_values.forEach(cf => {
        console.log(`  ${cf.field_code || cf.field_name}: ${JSON.stringify(cf.values)}`);
      });
    }
  }
})();