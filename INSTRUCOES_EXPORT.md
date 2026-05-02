# Instruções de Export Diário — OrthoDontic

> **Frequência:** todos os dias  
> **Horário:** até as 9h da manhã  
> **Formato:** mês corrente até hoje (ex.: 01/05 a 02/05 se estamos no dia 02/05)

---

## 🔧 Passo a Passo

### 1️⃣ LEADS (Gestão de Leads)

**Acessar:**  
Menu > Comercial > Gestão de Leads

**Filtros:**
- Data de Referência: **Cadastro (Lead único)**
- Período: **mês corrente até hoje**
- Demais filtros: deixar em branco (= todos)

**Botão:** Exportar (verde, lado direito)

**Nome do arquivo:** `YYYY-MM-DD_leads.xlsx`  
**Exemplo:** `2026-05-02_leads.xlsx`

**Pasta destino:** `imports/Centro/` (ou Varzea, ou Hortolandia, conforme sua unidade)

---

### 2️⃣ SISTEMA (Analítico de Contratos)

**Acessar:**  
Menu > Comercial > Analítico de Contratos

**Filtros:**
- Status: **Contratos por Data de Fechamento**
- Período: **mês corrente até hoje**
- Plano, Parcela, Campanha, Origem, Promotor, Dentista, Evento: deixar em branco (= todos)

**Botão:** Selecionar (azul) → depois clica em **Excel**

**Nome do arquivo:** `YYYY-MM-DD_sistema.xlsx`  
**Exemplo:** `2026-05-02_sistema.xlsx`

**Pasta destino:** `imports/Centro/` (ou Varzea, ou Hortolandia, conforme sua unidade)

---

### 3️⃣ PERFORMANCE (Relatório Performance)

**Acessar:**  
Menu > Comercial > Relatório Performance

**Filtros:**
- Base da Data: **Data do Agendamento**
- Período: **mês corrente até hoje**
- Telemarketing, Campanha, Ação, Origem: deixar em branco (= todos)

**Botão:** Exportar (verde, lado direito)

⚠️ **Atenção:** este arquivo exporta em **CSV** (não Excel)

**Nome do arquivo:** `YYYY-MM-DD_performance.csv`  
**Exemplo:** `2026-05-02_performance.csv`

**Pasta destino:** `imports/Centro/` (ou Varzea, ou Hortolandia, conforme sua unidade)

---

### 4️⃣ CAMPANHAS (Relatório Campanha)

**Acessar:**  
Menu > Comercial > Relatório Campanha

**Filtros:**
- Período: **mês corrente até hoje**
- Campanha, Ações, Locais: deixar em branco (= todos)

**Botão:** Exportar (botão similar aos anteriores)

**Nome do arquivo:** `YYYY-MM-DD_campanhas.xlsx`  
**Exemplo:** `2026-05-02_campanhas.xlsx`

**Pasta destino:** `imports/Centro/` (ou Varzea, ou Hortolandia, conforme sua unidade)

---

## 📋 Checklist Diário

- [ ] Exportei **Leads** do dia
- [ ] Exportei **Sistema** (contratos) do dia
- [ ] Exportei **Performance** do dia
- [ ] Exportei **Campanhas** do dia
- [ ] Joguei os 4 arquivos na pasta `imports/<minha-unidade>/`
- [ ] Aviso ao Lucas que exportei (ou deixei registrado na página de Status)

---

## ⚠️ Dicas Importantes

1. **Período padrão:** sempre do dia 1º até hoje do mês atual. Isso garante que o sistema tenha histórico completo sem duplicatas.

2. **Nomes de arquivo:** siga exatamente o padrão `YYYY-MM-DD_tipo`. Se errar o nome, o sistema detecta. Se o nome estiver errado, o Lucas sabe.

3. **Pasta de destino:** cada gerente tem sua pasta única (`imports/Centro/`, `imports/Varzea/`, `imports/Hortolandia/`). Se colocar na pasta errada, o dashboard mostra dado de outra unidade.

4. **CSV vs Excel:** só o **Performance** exporta CSV. Os outros 3 são Excel.

5. **Horário limite:** até as 9h da manhã. Se atrasou, avisa o Lucas.

6. **Se algo mudar depois:** um contrato que foi fechado em 28/04 mas só foi pago em 05/05 — para capturar o pagamento, você precisa exportar maio novamente (você já faria isso automaticamente, então não se preocupa).

---

## 📞 Dúvida?

Se a tela do OrthoDontic mudou ou o botão está em outro lugar, avisa o Lucas. Este documento é atualizado conforme necessário.

