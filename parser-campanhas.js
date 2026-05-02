require('dotenv').config();
const { Client } = require('pg');
const XLSX = require('xlsx');
const path = require('path');

// ====== CONFIGURAÇÃO ======
const ARQUIVO = process.env.OD_ARQUIVO || './imports/Centro/2026-04-30_campanhas.xlsx';
const UNIDADE_ID = parseInt(process.env.OD_UNIDADE_ID || '1', 10);  // 1=Centro, 2=Varzea, 3=Hortolandia
const DATA_RELATORIO = process.env.OD_DATA_RELATORIO || '2026-04-30';
// ==========================

function num(v) {
  if (v == null || v === '') return 0;
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

async function executar() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Lendo arquivo:', path.resolve(ARQUIVO));
  const wb = XLSX.readFile(ARQUIVO);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: null });

  console.log(`Linhas encontradas no arquivo: ${linhas.length}`);

  await client.connect();
  console.log('Conectado ao banco.');

  // 0. Idempotência mensal: apaga ingestões anteriores do mesmo mês desta unidade
  const mesRef = DATA_RELATORIO.slice(0, 7);
  const ingestoesAntigas = await client.query(
    `SELECT id FROM ingestoes
     WHERE unidade_id = $1 AND tipo = 'campanhas'
       AND to_char(data_relatorio, 'YYYY-MM') = $2`,
    [UNIDADE_ID, mesRef]
  );
  if (ingestoesAntigas.rows.length > 0) {
    const ids = ingestoesAntigas.rows.map(r => r.id);
    console.log(`Apagando ${ids.length} ingestão(ões) anterior(es) do mês ${mesRef}.`);
    await client.query(`DELETE FROM raw_campanhas WHERE ingestao_id = ANY($1::int[])`, [ids]);
    await client.query(`DELETE FROM ingestoes WHERE id = ANY($1::int[])`, [ids]);
  }

  // 1. Cria nova ingestão
  const ingestao = await client.query(
    `INSERT INTO ingestoes (unidade_id, arquivo, tipo, data_relatorio, status)
     VALUES ($1, $2, 'campanhas', $3, 'em_andamento')
     RETURNING id`,
    [UNIDADE_ID, ARQUIVO, DATA_RELATORIO]
  );
  const ingestaoId = ingestao.rows[0].id;
  console.log(`Ingestão #${ingestaoId} iniciada.`);

  let inseridas = 0;

  for (const l of linhas) {
    await client.query(
      `INSERT INTO raw_campanhas (
         unidade_id, data_relatorio, campanha, acao, origem,
         total_leads, interacoes, agendados, compareceram,
         contratos_fechados, contratos_pagos, ingestao_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        UNIDADE_ID,
        DATA_RELATORIO,
        null,
        l['Ação'],
        l['Origem'],
        num(l['Total Leads']),
        num(l['Interações']),
        num(l['Agendados']),
        num(l['Compareceram']),
        num(l['Contratos Fechados']),
        num(l['Contratos Pagos']),
        ingestaoId
      ]
    );
    inseridas++;
  }

  await client.query(
    `UPDATE ingestoes SET status='ok', qtd_linhas=$1, concluido_em=NOW() WHERE id=$2`,
    [inseridas, ingestaoId]
  );

  console.log(`\n${inseridas} linhas inseridas em raw_campanhas.`);

  const totais = await client.query(
    `SELECT 
       SUM(total_leads)        AS leads,
       SUM(agendados)          AS agendados,
       SUM(compareceram)       AS compareceram,
       SUM(contratos_fechados) AS fechados,
       SUM(contratos_pagos)    AS pagos
     FROM raw_campanhas WHERE ingestao_id = $1`,
    [ingestaoId]
  );
  const t = totais.rows[0];
  console.log('\nTotais agregados (oficial OrthoDontic):');
  console.log(`  Leads:                ${t.leads}`);
  console.log(`  Agendados:            ${t.agendados}`);
  console.log(`  Compareceram:         ${t.compareceram}`);
  console.log(`  Contratos fechados:   ${t.fechados}`);
  console.log(`  Contratos pagos:      ${t.pagos}`);

  await client.end();
  console.log('\nConcluído.');
}

executar().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
