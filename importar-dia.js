require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ====== CONFIGURAÇÃO ======
const PASTA_BASE = './imports';

const UNIDADES = {
  'Centro':      1,
  'Varzea':      2,
  'Hortolandia': 3
};

// Ordem de processamento: leads primeiro (topo do funil), sistema, performance, campanhas
const ORDEM_TIPOS = ['leads', 'sistema', 'performance', 'campanhas'];

const PARSERS = {
  'leads':       { script: './parser-leads.js',       extensoes: ['.xlsx'] },
  'sistema':     { script: './parser-sistema.js',     extensoes: ['.xlsx'] },
  'performance': { script: './parser-performance.js', extensoes: ['.csv', '.xlsx'] },
  'campanhas':   { script: './parser-campanhas.js',   extensoes: ['.xlsx'] }
};
// ==========================

function rodarParser(script, envExtra) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [script], {
      env: { ...process.env, ...envExtra },
      stdio: 'inherit',
      shell: true
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${script} terminou com código ${code}`));
    });
    proc.on('error', err => reject(err));
  });
}

function identificarTipo(nomeArquivo) {
  // Espera: YYYY-MM-DD_<tipo>.<ext>
  const lower = nomeArquivo.toLowerCase();
  for (const tipo of ORDEM_TIPOS) {
    for (const ext of PARSERS[tipo].extensoes) {
      if (lower.endsWith(`_${tipo}${ext}`)) return tipo;
    }
  }
  return null;
}

function extrairData(nomeArquivo) {
  const m = nomeArquivo.match(/^(\d{4}-\d{2}-\d{2})_/);
  return m ? m[1] : null;
}

async function executar() {
  console.log('========================================');
  console.log('  Importação diária OrthoDontic');
  console.log('========================================\n');

  if (!fs.existsSync(PASTA_BASE)) {
    console.error(`ERRO: pasta ${PASTA_BASE} não existe.`);
    process.exit(1);
  }

  let totalProcessados = 0;
  let totalIgnorados = 0;
  let totalErros = 0;

  for (const [nomeUnidade, unidadeId] of Object.entries(UNIDADES)) {
    const pasta = path.join(PASTA_BASE, nomeUnidade);

    if (!fs.existsSync(pasta)) {
      console.log(`[${nomeUnidade}] Pasta não existe. Pulando.\n`);
      continue;
    }

    const arquivos = fs.readdirSync(pasta).filter(a => !a.startsWith('.'));

    if (arquivos.length === 0) {
      console.log(`[${nomeUnidade}] Pasta vazia. Pulando.\n`);
      continue;
    }

    console.log(`========================================`);
    console.log(`[${nomeUnidade}] (unidade_id=${unidadeId}) — ${arquivos.length} arquivo(s)`);
    console.log(`========================================`);

    // Agrupa arquivos por tipo, processa na ordem definida
    for (const tipo of ORDEM_TIPOS) {
      const arquivosDoTipo = arquivos.filter(a => identificarTipo(a) === tipo);

      for (const arquivo of arquivosDoTipo) {
        const caminhoCompleto = path.join(pasta, arquivo);
        const dataRelatorio = extrairData(arquivo);

        if (!dataRelatorio) {
          console.log(`\n  ⚠ ${arquivo}: nome fora do padrão YYYY-MM-DD_tipo.ext. Pulando.`);
          totalIgnorados++;
          continue;
        }

        console.log(`\n--- ${tipo.toUpperCase()} | ${arquivo} | ${dataRelatorio} ---`);

        try {
          await rodarParser(PARSERS[tipo].script, {
            OD_ARQUIVO: caminhoCompleto,
            OD_UNIDADE_ID: String(unidadeId),
            OD_DATA_RELATORIO: dataRelatorio
          });
          totalProcessados++;
        } catch (e) {
          console.error(`  ✗ ERRO: ${e.message}`);
          totalErros++;
        }
      }
    }

    // Lista arquivos que ficaram sem tipo identificado
    const naoReconhecidos = arquivos.filter(a => identificarTipo(a) === null);
    if (naoReconhecidos.length > 0) {
      console.log(`\n  ⚠ Arquivos não reconhecidos em ${nomeUnidade}:`);
      naoReconhecidos.forEach(a => console.log(`    - ${a}`));
      totalIgnorados += naoReconhecidos.length;
    }

    console.log('');
  }

  console.log('========================================');
  console.log('  Resumo');
  console.log('========================================');
  console.log(`Processados: ${totalProcessados}`);
  console.log(`Ignorados:   ${totalIgnorados}`);
  console.log(`Erros:       ${totalErros}`);
  console.log('');
}

executar().catch(e => {
  console.error('ERRO FATAL:', e);
  process.exit(1);
});
