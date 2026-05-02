require('dotenv').config();
const { Client } = require('pg');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

// ====== CONFIGURAÇÃO ======
const ARQUIVO = process.env.OD_ARQUIVO || './imports/Centro/2026-04-30_performance.csv';
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

function parseDataBR(d) {
  if (!d) return null;
  const s = String(d).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, dia, mes, ano] = m;
  if (ano.length === 2) ano = '20' + ano;
  return `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
}

function parseValor(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace('.', '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function simNao(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'sim') return true;
  if (s === 'não' || s === 'nao') return false;
  return null;
}

async function executar() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Lendo arquivo:', path.resolve(ARQUIVO));
  const conteudo = fs.readFileSync(ARQUIVO, 'utf8');
  const texto = conteudo.replace(/^\uFEFF/, '');
  const linhas = parse(texto, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    relax_column_count: true
  });

  console.log(`Linhas encontradas no arquivo: ${linhas.length}`);

  await client.connect();
  console.log('Conectado ao banco.');

  // 0. Idempotência mensal: apaga ingestões anteriores do mesmo mês desta unidade
  const mesRef = DATA_RELATORIO.slice(0, 7);
  const ingestoesAntigas = await client.query(
    `SELECT id FROM ingestoes
     WHERE unidade_id = $1 AND tipo = 'performance'
       AND to_char(data_relatorio, 'YYYY-MM') = $2`,
    [UNIDADE_ID, mesRef]
  );
  if (ingestoesAntigas.rows.length > 0) {
    const ids = ingestoesAntigas.rows.map(r => r.id);
    console.log(`Apagando ${ids.length} ingestão(ões) anterior(es) do mês ${mesRef}.`);
    await client.query(`DELETE FROM raw_performance WHERE ingestao_id = ANY($1::int[])`, [ids]);
    await client.query(`DELETE FROM ingestoes WHERE id = ANY($1::int[])`, [ids]);
  }

  // 1. Cria nova ingestão
  const ingestao = await client.query(
    `INSERT INTO ingestoes (unidade_id, arquivo, tipo, data_relatorio, status)
     VALUES ($1, $2, 'performance', $3, 'em_andamento')
     RETURNING id`,
    [UNIDADE_ID, ARQUIVO, DATA_RELATORIO]
  );
  const ingestaoId = ingestao.rows[0].id;
  console.log(`Ingestão #${ingestaoId} iniciada.`);

  let inseridas = 0;

  for (const l of linhas) {
    const telOrig = l['Telefone'];
    const telNorm = normalizarTelefone(telOrig);

    await client.query(
      `INSERT INTO raw_performance (
         unidade_id, telemarketing, paciente_nome, telefone_orig, telefone_norm,
         data, status, compareceu, faltou, remarcado, agenda_futura,
         fechou, pagou, valor, campanha, origem, acao, ingestao_id
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18
       )`,
      [
        UNIDADE_ID,
        l['Telemarketing'],
        l['Nome'],
        telOrig,
        telNorm,
        parseDataBR(l['Data']),
        l['Status'],
        simNao(l['Compareceu']),
        simNao(l['Faltou']),
        simNao(l['Remarcado']),
        simNao(l['Agenda Futura']),
        simNao(l['Fechou']),
        simNao(l['Pagou']),
        parseValor(l['Valor']),
        l['Campanha'],
        l['Origem'],
        l['Ação'],
        ingestaoId
      ]
    );
    inseridas++;
  }

  await client.query(
    `UPDATE ingestoes SET status='ok', qtd_linhas=$1, concluido_em=NOW() WHERE id=$2`,
    [inseridas, ingestaoId]
  );

  console.log(`\n${inseridas} linhas inseridas em raw_performance.`);

  const porStatus = await client.query(
    `SELECT status, COUNT(*) as qtd
     FROM raw_performance WHERE ingestao_id = $1
     GROUP BY status ORDER BY qtd DESC`,
    [ingestaoId]
  );
  console.log('\nDistribuição por status:');
  porStatus.rows.forEach(r => {
    console.log(`  ${r.qtd} - ${r.status}`);
  });

  const porOperador = await client.query(
    `SELECT telemarketing, COUNT(*) as agendamentos,
            COUNT(*) FILTER (WHERE compareceu) as compareceram,
            COUNT(*) FILTER (WHERE pagou) as pagaram
     FROM raw_performance WHERE ingestao_id = $1
     GROUP BY telemarketing ORDER BY agendamentos DESC`,
    [ingestaoId]
  );
  console.log('\nPerformance por operador:');
  porOperador.rows.forEach(r => {
    console.log(`  ${r.telemarketing}: ${r.agendamentos} agendamentos, ${r.compareceram} compareceram, ${r.pagaram} pagaram`);
  });

  await client.end();
  console.log('\nConcluído.');
}

executar().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
