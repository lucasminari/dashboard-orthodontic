require('dotenv').config();
const { Client } = require('pg');
const XLSX = require('xlsx');
const path = require('path');

// ====== CONFIGURAÇÃO ======
const ARQUIVO = process.env.OD_ARQUIVO || './imports/Centro/2026-04-30_sistema.xlsx';
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
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, dia, mes, ano] = m;
  if (ano.length === 2) ano = '20' + ano;
  return `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
}

function parseValor(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseCampanhaOrigem(texto) {
  if (!texto) return { campanha: null, origem: null };
  const s = String(texto);
  const matchCamp = s.match(/Camp:\s*([^O]*?)(?=Origem:|$)/);
  const matchOrig = s.match(/Origem:\s*(.*)$/);
  return {
    campanha: matchCamp ? matchCamp[1].trim() || null : null,
    origem: matchOrig ? matchOrig[1].trim() || null : null
  };
}

async function executar() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Lendo arquivo:', path.resolve(ARQUIVO));
  const wb = XLSX.readFile(ARQUIVO);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: null, raw: false });

  console.log(`Linhas encontradas no arquivo: ${linhas.length}`);

  await client.connect();
  console.log('Conectado ao banco.');

  // 0. Idempotência mensal: apaga ingestões anteriores do mesmo mês desta unidade
  const mesRef = DATA_RELATORIO.slice(0, 7);
  const ingestoesAntigas = await client.query(
    `SELECT id FROM ingestoes
     WHERE unidade_id = $1 AND tipo = 'sistema'
       AND to_char(data_relatorio, 'YYYY-MM') = $2`,
    [UNIDADE_ID, mesRef]
  );
  if (ingestoesAntigas.rows.length > 0) {
    const ids = ingestoesAntigas.rows.map(r => r.id);
    console.log(`Apagando ${ids.length} ingestão(ões) anterior(es) do mês ${mesRef}.`);
    await client.query(`DELETE FROM raw_sistema WHERE ingestao_id = ANY($1::int[])`, [ids]);
    await client.query(`DELETE FROM ingestoes WHERE id = ANY($1::int[])`, [ids]);
  }

  // 1. Cria nova ingestão
  const ingestao = await client.query(
    `INSERT INTO ingestoes (unidade_id, arquivo, tipo, data_relatorio, status)
     VALUES ($1, $2, 'sistema', $3, 'em_andamento')
     RETURNING id`,
    [UNIDADE_ID, ARQUIVO, DATA_RELATORIO]
  );
  const ingestaoId = ingestao.rows[0].id;
  console.log(`Ingestão #${ingestaoId} iniciada.`);

  let inseridas = 0;

  for (const l of linhas) {
    const nomeBruto = l['Nome'] || '';
    const matchId = String(nomeBruto).match(/^(\d+)\s*-\s*(.+)$/);
    const idExterno = matchId ? matchId[1] : null;
    const nomeLimpo = matchId ? matchId[2].trim() : nomeBruto.trim();

    const telOrig = l['Telefone'];
    const telNorm = normalizarTelefone(telOrig);

    const { campanha, origem } = parseCampanhaOrigem(l['Campanha -|- Origem -|- Evento']);

    await client.query(
      `INSERT INTO raw_sistema (
         unidade_id, paciente_id_externo, paciente_nome, telefone_orig, telefone_norm,
         data_avaliacao, data_contrato, data_vcto, data_pgto,
         func_contrato, campanha, origem, indicacao, dentista, promotor,
         situacao, vlr_contrato, parcela_status, ingestao_id
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19
       )`,
      [
        UNIDADE_ID, idExterno, nomeLimpo, telOrig, telNorm,
        parseDataBR(l['Data Avaliação']),
        parseDataBR(l['Data Contrato']),
        parseDataBR(l['Data Vcto']),
        parseDataBR(l['Data Pgto']),
        l['Func. Contrato'], campanha, origem,
        l['Indicação'], l['Dentista'], l['Promotor'],
        l['Situação'], parseValor(l['Vl.Contrato']), l['Parcela'],
        ingestaoId
      ]
    );
    inseridas++;
  }

  await client.query(
    `UPDATE ingestoes SET status='ok', qtd_linhas=$1, concluido_em=NOW() WHERE id=$2`,
    [inseridas, ingestaoId]
  );

  console.log(`\n${inseridas} linhas inseridas em raw_sistema.`);

  const conferencia = await client.query(
    `SELECT paciente_nome, telefone_norm, data_contrato, data_vcto, data_pgto, vlr_contrato
     FROM raw_sistema WHERE ingestao_id = $1 ORDER BY data_contrato DESC`,
    [ingestaoId]
  );
  console.log('\nPrimeiros registros:');
  conferencia.rows.forEach(r => {
    const pago = r.data_pgto ? `pago em ${r.data_pgto.toISOString().slice(0,10)}` : `PENDENTE (vence ${r.data_vcto?.toISOString().slice(0,10)})`;
    console.log(`  ${r.paciente_nome} | ${r.telefone_norm} | R$ ${r.vlr_contrato} | ${pago}`);
  });

  await client.end();
  console.log('\nConcluído.');
}

executar().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
