require('dotenv').config();
const { Client } = require('pg');
const XLSX = require('xlsx');
const path = require('path');

// ====== CONFIGURAÇÃO ======
const ARQUIVO = process.env.OD_ARQUIVO || './imports/Centro/2026-04-30_leads.xlsx';
const UNIDADE_ID = parseInt(process.env.OD_UNIDADE_ID || '1', 10);  // 1=Centro, 2=Varzea, 3=Hortolandia
const DATA_RELATORIO = process.env.OD_DATA_RELATORIO || '2026-04-30';
// ==========================

function normalizarTelefone(t) {
  if (!t) return null;
  const digitos = String(t).replace(/[^0-9]/g, '');
  if (digitos.length >= 11) return digitos.slice(-11);
  if (digitos.length >= 10) return digitos.slice(-10);
  return null;
}

function parseDataHora(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const s = String(d).trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) {
    const [, y, m, d_, h, mi, se] = isoMatch;
    return `${y}-${m}-${d_}T${h}:${mi}:${se}-03:00`;
  }
  return null;
}

async function executar() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Lendo arquivo:', path.resolve(ARQUIVO));
  const wb = XLSX.readFile(ARQUIVO);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

  console.log(`Linhas encontradas no arquivo: ${linhas.length}`);

  await client.connect();
  console.log('Conectado ao banco.');

  // 0. Idempotência mensal: apaga ingestões anteriores do mesmo mês desta unidade
  const mesRef = DATA_RELATORIO.slice(0, 7);
  const ingestoesAntigas = await client.query(
    `SELECT id FROM ingestoes
     WHERE unidade_id = $1 AND tipo = 'leads'
       AND to_char(data_relatorio, 'YYYY-MM') = $2`,
    [UNIDADE_ID, mesRef]
  );
  if (ingestoesAntigas.rows.length > 0) {
    const ids = ingestoesAntigas.rows.map(r => r.id);
    console.log(`Apagando ${ids.length} ingestão(ões) anterior(es) do mês ${mesRef}.`);
    await client.query(`DELETE FROM raw_leads WHERE ingestao_id = ANY($1::int[])`, [ids]);
    await client.query(`DELETE FROM ingestoes WHERE id = ANY($1::int[])`, [ids]);
  }

  // 1. Cria nova ingestão
  const ingestao = await client.query(
    `INSERT INTO ingestoes (unidade_id, arquivo, tipo, data_relatorio, status)
     VALUES ($1, $2, 'leads', $3, 'em_andamento')
     RETURNING id`,
    [UNIDADE_ID, ARQUIVO, DATA_RELATORIO]
  );
  const ingestaoId = ingestao.rows[0].id;
  console.log(`Ingestão #${ingestaoId} iniciada.`);

  let inseridas = 0;

  for (const l of linhas) {
    const telOrig = l['Telefone'] || l['Celular'];
    const telNorm = normalizarTelefone(telOrig);

    await client.query(
      `INSERT INTO raw_leads (
         unidade_id, data_cadastro, origem, campanha, nome,
         telefone_orig, telefone_norm, responsavel, ingestao_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        UNIDADE_ID,
        parseDataHora(l['Cadastro']),
        l['Origem'],
        l['Campanha'],
        l['Nome'],
        telOrig,
        telNorm,
        l['Responsável'],
        ingestaoId
      ]
    );
    inseridas++;
  }

  await client.query(
    `UPDATE ingestoes SET status='ok', qtd_linhas=$1, concluido_em=NOW() WHERE id=$2`,
    [inseridas, ingestaoId]
  );

  console.log(`\n${inseridas} linhas inseridas em raw_leads.`);

  const topCampanhas = await client.query(
    `SELECT campanha, COUNT(*) as qtd
     FROM raw_leads WHERE ingestao_id = $1
     GROUP BY campanha ORDER BY qtd DESC LIMIT 5`,
    [ingestaoId]
  );
  console.log('\nLeads por campanha:');
  topCampanhas.rows.forEach(r => {
    console.log(`  ${r.qtd} - ${r.campanha || '(sem campanha)'}`);
  });

  await client.end();
  console.log('\nConcluído.');
}

executar().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
