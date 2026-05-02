require('dotenv').config();

const TOKEN = process.env.KOMMO_TOKEN;
const SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;

if (!TOKEN || !SUBDOMAIN) {
  console.error('ERRO: KOMMO_TOKEN ou KOMMO_SUBDOMAIN não está no .env');
  process.exit(1);
}

const BASE_URL = `https://${SUBDOMAIN}.kommo.com/api/v4`;

async function chamarKommo(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  const resposta = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(`HTTP ${resposta.status}: ${erro.slice(0, 300)}`);
  }
  return await resposta.json();
}

async function executar() {
  console.log(`Conectando em https://${SUBDOMAIN}.kommo.com ...`);

  // 1. Conta da empresa
  const conta = await chamarKommo('/account');
  console.log(`\nConta: ${conta.name}`);
  console.log(`ID:    ${conta.id}`);
  console.log(`País:  ${conta.country}`);

  // 2. Pipelines (funis)
  const pipelines = await chamarKommo('/leads/pipelines');
  console.log(`\nPipelines (${pipelines._embedded.pipelines.length}):`);
  pipelines._embedded.pipelines.forEach(p => {
    console.log(`  ${p.id} - ${p.name}`);
  });

  // 3. Total de leads (limit 1 só pra ver o total)
  const leads = await chamarKommo('/leads?limit=1');
  console.log(`\nLeads: amostra recebida com sucesso.`);
  if (leads._embedded?.leads?.[0]) {
    const primeiro = leads._embedded.leads[0];
    console.log(`Exemplo (1 lead): id ${primeiro.id}, nome "${primeiro.name}", criado em ${new Date(primeiro.created_at * 1000).toISOString().slice(0,10)}`);
  }

  console.log('\nConcluído.');
}

executar().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});