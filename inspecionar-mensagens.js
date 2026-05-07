require('dotenv').config();

// Suporta os dois nomes que aparecem no repo
const TOKEN = process.env.KOMMO_TOKEN || process.env.KOMMO_ACCESS_TOKEN;
const SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const PIPELINE = 13518920;

if (!TOKEN || !SUBDOMAIN) {
  console.error('ERRO: defina KOMMO_TOKEN (ou KOMMO_ACCESS_TOKEN) e KOMMO_SUBDOMAIN no .env');
  process.exit(1);
}

async function chamada(path) {
  const url = `https://${SUBDOMAIN}.kommo.com/api/v4${path}`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' }
  });
  if (r.status === 204) return null;
  if (r.status === 401 || r.status === 403) {
    const t = await r.text();
    return { __erro: `${r.status}: ${t.slice(0, 300)}` };
  }
  if (!r.ok) {
    const t = await r.text();
    return { __erro: `HTTP ${r.status}: ${t.slice(0, 300)}` };
  }
  return r.json();
}

function ts(unix) {
  if (!unix) return '(sem timestamp)';
  return new Date(unix * 1000).toISOString();
}

function trunc(s, n = 120) {
  if (s == null) return '(vazio)';
  const str = String(s).replace(/\s+/g, ' ').trim();
  return str.length <= n ? str : str.slice(0, n) + '…';
}

(async () => {
  console.log('=== INSPEÇÃO DAS FORMAS DE MENSAGEM NO KOMMO ===');
  console.log(`Subdomain: ${SUBDOMAIN}`);
  console.log(`Pipeline alvo: ${PIPELINE}\n`);

  // 1. Pega um lead recente do pipeline (mais provável de ter conversa)
  console.log('--- 1) Buscando lead recente do pipeline com conversa ---');
  const buscarLeads = await chamada(
    `/leads?filter[pipeline_id]=${PIPELINE}&order[updated_at]=desc&limit=10`
  );
  if (!buscarLeads || buscarLeads.__erro || !buscarLeads._embedded?.leads?.length) {
    console.log('Não consegui buscar leads:', buscarLeads?.__erro || 'sem leads');
    return;
  }
  const candidatos = buscarLeads._embedded.leads;
  console.log(`Encontrei ${candidatos.length} candidatos. Vou tentar achar um com notes/messages.\n`);

  // 2. Pra cada candidato, conta notes ate achar um com material
  let leadEscolhido = null;
  let notes = null;
  for (const lead of candidatos) {
    const n = await chamada(`/leads/${lead.id}/notes?limit=50`);
    if (n && !n.__erro && n._embedded?.notes?.length) {
      leadEscolhido = lead;
      notes = n;
      console.log(`Lead ${lead.id} (${lead.name}) tem ${n._embedded.notes.length} notes. Usando este.`);
      break;
    }
  }
  if (!leadEscolhido) {
    console.log('Nenhum dos 10 leads tem notes. Pegando o mais recente mesmo assim pra inspecionar.');
    leadEscolhido = candidatos[0];
    notes = await chamada(`/leads/${leadEscolhido.id}/notes?limit=50`);
  }

  // ─────────────────────────────────────────────────────────────────
  console.log('\n=== 2) NOTES DO LEAD ===');
  console.log(`Lead: ${leadEscolhido.id} — ${leadEscolhido.name}`);
  console.log(`Status: ${leadEscolhido.status_id}, atualizado em ${ts(leadEscolhido.updated_at)}\n`);

  if (!notes || notes.__erro || !notes._embedded?.notes) {
    console.log('Sem notes disponíveis:', notes?.__erro || 'vazio');
  } else {
    const lista = notes._embedded.notes;
    // Agrupa por note_type
    const porTipo = {};
    for (const n of lista) {
      porTipo[n.note_type] = porTipo[n.note_type] || [];
      porTipo[n.note_type].push(n);
    }
    console.log(`Total: ${lista.length} notes. Tipos encontrados:`);
    for (const [tipo, arr] of Object.entries(porTipo)) {
      console.log(`  ${tipo}: ${arr.length}x`);
    }
    console.log('\nPrimeira nota de cada tipo (campos completos):');
    for (const [tipo, arr] of Object.entries(porTipo)) {
      const n = arr[0];
      console.log(`\n  ── note_type: ${tipo} ──`);
      console.log(`     id:           ${n.id}`);
      console.log(`     created_at:   ${ts(n.created_at)}`);
      console.log(`     created_by:   ${n.created_by}`);
      console.log(`     updated_by:   ${n.updated_by}`);
      console.log(`     params keys:  ${Object.keys(n.params || {}).join(', ') || '(nenhum)'}`);
      if (n.params) {
        for (const [k, v] of Object.entries(n.params)) {
          console.log(`       ${k}: ${trunc(JSON.stringify(v), 200)}`);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  console.log('\n=== 3) ENDPOINT /talks (Kommo Chats) ===');
  const talks = await chamada(`/talks?filter[lead_id][]=${leadEscolhido.id}&limit=50`);
  if (!talks) {
    console.log('  /talks devolveu 204 (sem conteúdo)');
  } else if (talks.__erro) {
    console.log('  Erro:', talks.__erro);
  } else if (talks._embedded?.talks?.length) {
    console.log(`  ${talks._embedded.talks.length} talk(s) pro lead. Estrutura do primeiro:`);
    console.log('   ', JSON.stringify(talks._embedded.talks[0], null, 2).slice(0, 2000));
  } else {
    console.log('  Sem talks pro lead.');
  }

  // ─────────────────────────────────────────────────────────────────
  console.log('\n=== 4) ENDPOINT /events (event log da conta) ===');
  // Tipos comuns de evento de chat: incoming_chat_message, outgoing_chat_message
  const tiposChat = ['incoming_chat_message', 'outgoing_chat_message'];
  for (const t of tiposChat) {
    const ev = await chamada(`/events?filter[type]=${t}&filter[entity_id]=${leadEscolhido.id}&limit=5`);
    if (!ev) {
      console.log(`  ${t}: 204`);
    } else if (ev.__erro) {
      console.log(`  ${t}: ${ev.__erro}`);
    } else {
      const arr = ev._embedded?.events || [];
      console.log(`  ${t}: ${arr.length} evento(s)`);
      if (arr.length) {
        const e = arr[0];
        console.log(`    primeiro evento — created_at: ${ts(e.created_at)}, created_by: ${e.created_by}`);
        console.log(`    value_after: ${trunc(JSON.stringify(e.value_after), 200)}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  console.log('\n=== 5) USUÁRIOS (pra identificar quem é a Olívia) ===');
  const usuarios = await chamada('/users?limit=50');
  if (usuarios && !usuarios.__erro && usuarios._embedded?.users) {
    for (const u of usuarios._embedded.users) {
      const flag = /(olivia|olívia|bot|ia|chat)/i.test(u.name + ' ' + (u.email || ''));
      console.log(`  ${u.id}\t${u.name}${u.email ? ' <' + u.email + '>' : ''}${flag ? '  ← candidato a Olívia' : ''}`);
    }
  } else {
    console.log('  Não consegui listar usuários:', usuarios?.__erro || 'vazio');
  }

  // ─────────────────────────────────────────────────────────────────
  console.log('\n=== RESUMO ===');
  console.log('Pra montar tracking_messages, observe acima:');
  console.log('  - Que note_type tem o texto da conversa em params (tipicamente "service_message" ou similar)');
  console.log('  - Se /talks retornou estrutura útil (id do chat, ultimo timestamp)');
  console.log('  - Se /events com incoming_chat_message tem o conteúdo (caso /notes não tenha)');
  console.log('  - Qual user_id é a Olívia (pra distinguir mensagens humanas de bot)');
})().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
