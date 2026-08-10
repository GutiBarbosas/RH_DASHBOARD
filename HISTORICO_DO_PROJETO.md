# Histórico do Projeto — Portal de RH (Rede de Farmácias)

Este documento registra **tudo o que foi construído até agora**, decisão por
decisão, para que o trabalho possa continuar mesmo que o histórico de
conversa com o Claude seja perdido. Leia isto antes de pedir qualquer
alteração nova — ele dá o contexto completo do projeto.

> **Como usar este arquivo em uma conversa nova:** se você abrir um chat novo
> com o Claude, envie este arquivo (ou cole o conteúdo dele) junto com os
> arquivos do projeto. Isso permite que o Claude entenda a arquitetura, as
> convenções de nomes e o que já foi decidido, sem precisar redescobrir nada.

---

## 1. Objetivo do projeto

Um **Portal de RH** para uma rede de farmácias, publicado como site estático
no **GitHub Pages**. Não é "só um dashboard": é a base de um portal que vai
ganhar novos módulos ao longo do tempo, sem precisar reescrever código.

**Módulos ativos hoje:**
- Dashboard Executivo
- Admissões
- Desligamentos
- Controle de Rescisões

**Módulos planejados (já aparecem no menu como "Em breve"):**
Férias · Banco de Horas · Turnover · Absenteísmo · Treinamentos ·
Indicadores do CD · Auditorias · Documentos

**Restrições técnicas definidas pelo usuário (não negociáveis):**
- Proibido usar: React, Vue, Angular, Bootstrap, jQuery, Node (como
  runtime do site), PHP.
- Permitido: HTML, CSS, JavaScript puro. Chart.js é permitido (via CDN).
- Deve rodar 100% estático, hospedável direto no GitHub Pages.

---

## 2. Linha do tempo do que foi feito

### Etapa 1 — Estrutura profissional do sistema (scaffold)

**Pedido do usuário:** montar toda a arquitetura visual e de código do
portal — sidebar, cabeçalho, área de filtros, cards, área reservada para
gráficos, área de tabelas — **sem** gráficos de verdade e **sem** integração
de dados ainda. Só a "casca" profissional.

**O que foi entregue:**
- Estrutura de pastas fixada (ver seção 4).
- Visual dark mode discreto, inspirado em Microsoft Fabric / Power BI /
  Looker Studio / SAP Analytics — sem exageros, tons neutros.
- Tipografia: **Inter** (textos/UI) + **JetBrains Mono** (números/KPIs), via
  Google Fonts.
- Paleta de cores em variáveis CSS (`:root` em `css/style.css`): fundo quase
  preto azulado (`--bg-base: #0B0F14`), acento azul-aço discreto
  (`--accent-primary: #5B8DEF`), acento dourado (`--accent-secondary:
  #C9A15A`, remete a etiqueta/rótulo farmacêutico) e cores semânticas
  (sucesso/erro/alerta) usadas com moderação.
- Elemento de assinatura visual: uma "rail" (barra colorida de 2–3px) no
  topo dos cards de KPI e à esquerda do item de menu ativo.
- **Roteador SPA baseado em hash** (`#dashboard`, `#admissoes`,
  `#desligamentos`, `#rescisoes`) — sem reload de página, implementado em
  `js/script.js`.
- **`MODULE_REGISTRY`**: um único array em `script.js` que é a fonte de
  verdade de todos os módulos (ativos e "em breve"). Adicionar um módulo
  novo no futuro = adicionar um item nesse array + escrever uma função de
  `render` — nada em `index.html` precisa mudar.
- Sidebar colapsável (desktop) e menu tipo drawer (mobile), com overlay.
- Componentes reutilizáveis via funções JS (não HTML fixo): `kpiCard()`,
  `chartGrid()`, `tableCard()`, `sectionHeader()` etc.
- Templates HTML de referência (não usados em produção, só documentação
  visual) em `assets/components/`.
- Analisei o arquivo `BASE_ADMISSÕES_E_DEMISSÕES_FINAL.xlsx` enviado pelo
  usuário para descobrir as colunas reais das bases (ver seção 5), e usei
  esses nomes de coluna nos cabeçalhos das tabelas desde o início, mesmo
  sem integração — para que a integração futura não exigisse redesenhar
  nada.
- Gráficos: só placeholders visuais ("O gráfico será renderizado aqui após
  a integração de dados"), com Chart.js já carregado via CDN em
  `index.html`, pronto para ser ativado depois.
- Testado com Playwright (screenshots desktop, mobile, sidebar colapsada,
  menu mobile aberto) — sem erros de console relacionados à aplicação.

### Etapa 2 — Integração com Google Sheets

**Pedido do usuário:** conectar o portal a 3 planilhas do Google Sheets
publicadas como CSV (Admissões, Desligamentos, Lojas/Headcount), com leitura
**automática** (as bases são atualizadas diariamente na origem). Requisitos
explícitos: converter CSV→JSON, padronizar nomes de coluna, ignorar linhas
vazias, tratar erros com mensagem amigável, exibir loading, ter cache, ter
botão "Atualizar Dados", e manter toda a comunicação isolada em um único
arquivo `googleSheets.js`.

**Links configurados** (publicados via Arquivo → Compartilhar → Publicar na
Web → CSV, todos da mesma planilha, abas diferentes por `gid`):
- Desligamentos: `gid=0`
- Admissões: `gid=1814932616`
- Lojas/Headcount: `gid=1839596594`

*(URLs completas estão salvas em `js/googleSheets.js`, dentro de `SHEET_URLS`.)*

**O que foi entregue:**
- `js/googleSheets.js` **reescrito do zero** como única camada de
  comunicação com a fonte de dados:
  - Parser de CSV **próprio** (sem biblioteca externa), no padrão RFC 4180
    simplificado — trata campos entre aspas, vírgulas internas, aspas
    escapadas (`""`) e remove BOM.
  - Padronização de colunas por **mapeamento posicional** (não por nome do
    cabeçalho) — decisão tomada porque a planilha de origem tem duas
    colunas chamadas "COLABORADOR" (nome completo e abreviado), o que
    impede usar o nome como chave única, e porque acentos podem vir
    corrompidos dependendo da exportação. Ver mapeamento completo na
    seção 5.
  - Linhas totalmente vazias e linhas sem o campo-chave (`COLABORADOR` para
    admissões/desligamentos, `LOJA` para a base de lojas) são descartadas.
  - Cache em duas camadas: memória (10 minutos, evita recarregar a cada
    troca de filtro) + `localStorage` (persistente entre sessões, usado
    como fallback se uma leitura falhar).
  - Sistema de eventos (`subscribe`/`emit`) para a interface reagir a
    `loading` / `success` / `error` de cada base individualmente, sem
    acoplamento entre arquivos.
  - `fetchAll()` busca as 3 bases em paralelo; `refreshAll()` força nova
    leitura ignorando o cache (usado pelo botão "Atualizar dados").
  - Toda função de busca retorna um contrato estável e previsível:
    `{ ok, data, error, stale, fromCache }` — nunca lança exceção para quem
    chama, então a interface nunca "quebra".
  - Função `fetchRescisoes()` já preparada (isolada, mesmo padrão), mas
    retorna vazio com aviso, pois essa base ainda não existe/foi publicada.
- `js/script.js` **reescrito** para consumir dados reais:
  - Filtros (Loja, Mês, Gerente, Status, Função, Tipo de Documento, Tipo de
    Aviso) agora são gerados dinamicamente a partir dos valores realmente
    presentes nos dados carregados.
  - KPIs calculados de verdade: headcount total, admissões/desligamentos no
    período filtrado, turnover (%), saldo de contratações, admissões
    finalizadas/pendentes, loja com mais admissões, desligamentos por tipo
    de aviso etc.
  - Tabelas populadas com os dados reais (ordenadas por data mais recente),
    com paginação simples (limite de linhas exibidas + aviso de que há mais
    registros).
  - Estado de **loading** visível (skeleton/spinner) enquanto os dados
    carregam pela primeira vez.
  - **Banner de erro amigável, isolado por base**: se só a base de
    Desligamentos falhar, por exemplo, só o módulo de Desligamentos mostra
    o aviso — os demais módulos continuam funcionando normalmente com os
    dados que carregaram com sucesso. O banner tem botão "Tentar novamente".
  - Indicador de sincronização (bolinha colorida na sidebar + selo no
    cabeçalho): verde = tudo certo, âmbar pulsando = sincronizando, âmbar
    fixo = parcialmente sincronizado, cinza = falhou.
  - Filtros escolhidos pelo usuário são preservados ao atualizar os dados
    (não resetam ao clicar em "Atualizar dados").
- `js/filters.js`: adicionado o método `setState()` à API retornada por
  `createFilterBar()`, para restaurar a seleção de filtros sem disparar o
  callback `onChange` (usado no ponto acima).
- `css/style.css`: nova seção de estilos para o botão "Atualizar dados",
  banners de alerta (variantes de aviso/erro) e estados de carregamento
  (pulsação em KPIs e badge de contagem de tabela).
- `index.html`: adicionado o botão **"Atualizar dados"** no cabeçalho, ao
  lado do selo de "última atualização".
- **Testes realizados** (via Playwright, simulando os 3 CSVs com dados no
  mesmo formato da planilha real, incluindo uma linha em branco de
  propósito):
  - Cálculo de headcount total: correto (soma das lojas).
  - Contagem de admissões/desligamentos: correto (linha vazia foi
    ignorada).
  - Cálculo de turnover (%): correto.
  - Filtro por loja: correto (KPIs e tabela recalculam).
  - Cenário de falha (uma das 3 bases retornando erro HTTP 500): o sistema
    mostrou "Dados parciais — uma ou mais bases falharam", exibiu o banner
    amigável com botão de nova tentativa **apenas** no módulo afetado, e os
    módulos com dados válidos continuaram funcionando normalmente.

---

### Etapa 3 — Dashboard Executivo (KPIs, gráficos reais e rankings)

**Pedido do usuário:** transformar o Dashboard Executivo (usado diariamente
por RH e Diretoria) no painel analítico completo, com 9 cards de KPI, 10
gráficos profissionais e filtros globais (Ano, Mês, Loja, Supervisor,
Gerente, Função, busca por colaborador) — tudo reagindo automaticamente aos
filtros.

**O que foi entregue:**
- `js/charts.js` **ativado de verdade** no Dashboard Executivo: as funções
  `renderBarChart`/`renderLineChart`/`renderDonutChart` (já existiam prontas
  desde a Etapa 2, mas não eram chamadas por nenhum módulo) agora desenham
  gráficos reais com Chart.js. Os demais módulos (Admissões, Desligamentos,
  Rescisões) continuam com os placeholders visuais por enquanto — não faziam
  parte deste pedido.
- `js/script.js`:
  - `renderDashboard()` reescrito por completo.
  - **9 KPIs**: Admissões, Desligamentos, Admissões em andamento, Rescisões
    em andamento (mostra "—" com aviso "Base ainda não conectada", já
    preparado para quando a planilha de rescisões existir), Turnover geral,
    Tempo médio entre admissão e desligamento, Loja/Supervisor com mais
    desligamentos e Função com maior turnover.
  - **Tempo médio entre admissão e desligamento**: calculado casando cada
    desligamento com a admissão mais recente do mesmo colaborador que
    aconteceu antes dele (melhor esforço — a planilha não tem matrícula
    única, só o nome do colaborador).
  - **10 gráficos**: Desligamentos por mês, Admissões por mês, Comparativo
    mensal Admissões x Desligamentos (barras agrupadas), Desligamentos por
    Loja/Supervisor/Gerente (barras horizontais, top 10) e Desligamentos por
    Função (rosca/donut).
  - **3 rankings** (lojas, supervisores, funções): cards de leaderboard com
    posição, barra proporcional e métricas de admissões/saldo — pensados
    para complementar os gráficos de barra em vez de repetir a mesma
    informação.
  - Novos helpers isolados na seção "5b" do arquivo: `groupMovStats`
    (agrupamento admissões x desligamentos por campo, usado nos gráficos e
    rankings), `computeAvgTenureDays`, `withAno` (deriva o campo `ANO` a
    partir de `DATA` para o filtro global), `realChartGrid`/`buildChartCard`
    (montagem dos cards de gráfico real) e `rankingCard`/`rankingGrid`.
  - `loadAllData()` agora também busca a base de Rescisões em paralelo (via
    `GoogleSheets.fetchRescisoes()`), só para alimentar o KPI "Rescisões em
    andamento" — o módulo de Rescisões em si continua sem planilha própria.
- `js/filters.js`: suporte a um novo tipo de campo, `type: 'text'` — usado
  no filtro "Colaborador" (busca por nome). Dispara com um pequeno atraso
  (debounce de 350ms) enquanto o usuário digita, em vez de esperar o campo
  perder o foco.
- `js/utils.js`: nova função `Utils.normalize()` (remove acentos e caixa),
  usada para a busca por colaborador funcionar mesmo com acentuação/caixa
  diferentes.
- `css/style.css`: novo componente de ranking (`.ranking-card`,
  `.ranking-item` etc.), correção do input de texto no filtro (removida a
  seta de `<select>` que aparecia por engano) e o canvas dos gráficos
  passou a ter altura fixa (280px) para o Chart.js medir corretamente.
- **Bug encontrado e corrigido durante os testes**: os gráficos eram
  instanciados (`new Chart(...)`) **antes** do grid ser anexado ao DOM, o
  que fazia o Chart.js medir um contêiner com tamanho zero e não desenhar
  nada (canvas ficava no tamanho padrão do navegador, 300x150, vazio). A
  correção foi separar a montagem do HTML (síncrona) da criação das
  instâncias do Chart.js (adiada com `requestAnimationFrame`, já com o grid
  anexado).
- **Testes realizados** (via Playwright, simulando as 3 planilhas com ~120
  admissões e ~70 desligamentos, e servindo uma cópia local do Chart.js só
  para o teste, já que o ambiente de teste bloqueia o CDN):
  - Os 9 KPIs, os 7 canvases (10 gráficos, sendo 1 combinado) e os 3 cards
    de ranking aparecem corretamente.
  - Confirmado por leitura de pixels que os 7 gráficos desenham conteúdo de
    verdade (antes da correção do bug, todos ficavam em branco).
  - Filtro de texto "Colaborador" reduziu a contagem corretamente ao buscar
    por um nome parcial.
  - Filtro de Loja e de Função recalcularam KPIs, gráficos e rankings
    corretamente, sem erros no console.

---

### Etapa 4 — Módulo Controle de Rescisões (cálculo automático de prazos)

**Pedido do usuário:** implementar de verdade o módulo Controle de Rescisões
(que até aqui só existia como aviso de "base não conectada"), calculando
automaticamente o prazo legal de pagamento da rescisão a partir da coluna
`TIPO_AVISO`, classificando cada processo em 4 níveis de risco (com cores) e
destacando imediatamente, ao abrir o módulo, qualquer rescisão em risco de
atraso.

**Decisão de arquitetura mais importante desta etapa:** o módulo **não
ganhou planilha própria**. A base de Desligamentos já contém exatamente os
campos necessários (`TIPO_AVISO`, `DATA`, `COLABORADOR`, `LOJA`, `GERENTE`,
`SUPERVISOR`, `FUNCAO`), então o Controle de Rescisões passou a **derivar**
seus dados da mesma leitura de Desligamentos (`DATASETS.desligamentos`),
sem nenhuma chamada de rede adicional. `GoogleSheets.fetchRescisoes()`
continua existindo e retornando vazio (não foi removida, para não quebrar o
KPI "Rescisões em andamento" do Dashboard Executivo, que continua
inalterado) — mas o módulo de Rescisões em si não depende mais dela.

**Regra de cálculo do prazo** (dias corridos, a partir da `DATA` do
desligamento):
- `TRABALHADO` → 30 dias de aviso prévio + 9 dias após a projeção = **39 dias**.
- `INDENIZADO` → **10 dias**.
- `DISPENSA DE AVISO` → **10 dias**.
- Qualquer outro valor (vazio ou não reconhecido) → prazo não calculado,
  linha classificada como "Sem tipo de aviso" (nível neutro/cinza), para não
  gerar um prazo incorreto silenciosamente.

A comparação do texto de `TIPO_AVISO` é feita via `Utils.normalize()`
(remove acento/caixa) e `includes()`, no mesmo padrão já usado no módulo de
Desligamentos — tolera variações como "Trabalhado", "TRABALHADO " ou
"trabalhado " sem espaço extra quebrar o cálculo.

**Níveis de risco (do mais tranquilo ao mais crítico), com base nos "dias
restantes" até o prazo final:**
- **Prazo OK** (verde) — mais de 15 dias restantes.
- **Atenção** (amarelo) — de 6 a 15 dias restantes.
- **Urgente** (laranja) — de 0 a 5 dias restantes. *Cor nova nesta etapa*:
  foi criado o token `--status-urgent` (`#DB7F3B`) em `css/style.css`, já
  que a paleta anterior só tinha verde/amarelo/vermelho/cinza — laranja era
  necessário para diferenciar "Urgente" de "Atenção" e de "Vencido".
- **Vencido** (vermelho) — dias restantes negativo (prazo já passou).

**O que foi entregue:**
- `js/script.js`:
  - Nova seção de helpers **"5c. Helpers do módulo de Controle de
    Rescisões"**: `prazoDiasPorTipoAviso`, `addDiasCorridos`,
    `hojeMeiaNoite`, `classificarPrazoRescisao`, `buildRescisoes` (monta a
    lista com `DATA_LIMITE`, `DIAS_RESTANTES`, `STATUS_RESCISAO` e
    `STATUS_LABEL` calculados), `sortByUrgencia` (vencidos e mais próximos
    do prazo primeiro; sem prazo definido vai para o final) e
    `rescisaoSummaryCard`/`rescisaoSummaryGrid` (cards de contagem por
    nível).
  - `dataTableCard()` ganhou um parâmetro novo e **opcional**, `rowClass`
    (função `(row) => string`), usado para aplicar uma classe extra ao
    `<tr>` — hoje só o Controle de Rescisões usa isso (linhas vencidas/
    urgentes recebem destaque visual). Todos os outros módulos que já
    chamavam `dataTableCard()` continuam funcionando exatamente como antes
    (parâmetro não informado = comportamento inalterado).
  - `renderRescisoes()` reescrita por completo: banner de alerta visível
    imediatamente quando há vencidas/urgentes (aparece antes até da
    tabela), 4 cards de resumo (Vencidas, Urgentes, Até 15 dias, Até 30
    dias — contagens cumulativas, ou seja, "Até 30 dias" inclui as
    urgentes e vencidas dentro da janela), barra de filtros (Loja,
    Supervisor, Gerente, Função, Tipo de Aviso, Status do prazo, busca por
    Colaborador) e tabela ordenada automaticamente pela urgência.
- `css/style.css`:
  - Novo token de cor `--status-urgent` / `--status-urgent-dim` (laranja),
    junto dos demais tokens semânticos.
  - Nova variante de badge `.tag--urgent`.
  - Nova seção **"14. Módulo de Controle de Rescisões"**: grid e cards de
    resumo (`.rescisao-summary-grid`, `.rescisao-summary-card` + variantes
    `--danger/--urgent/--warning/--success/--neutral`) e destaque de linha
    na tabela (`.row-vencido`, `.row-urgente`).
- Nenhum arquivo novo foi criado — nem HTML, nem planilha. Toda a
  funcionalidade foi construída reaproveitando a estrutura e os dados já
  existentes, conforme a restrição do projeto.
- **Testes realizados** (via Playwright, simulando a base de Desligamentos
  com 5 casos propositalmente escolhidos — um vencido, um urgente, um em
  atenção, um com prazo tranquilo e um sem `TIPO_AVISO` preenchido):
  - Os 4 cards de resumo somaram corretamente (1 vencida, 1 urgente, 2
    dentro de 15 dias, 2 dentro de 30 dias).
  - O banner de alerta apareceu automaticamente citando a vencida e a
    urgente, sem precisar de nenhuma ação do usuário.
  - A tabela ordenou corretamente do mais urgente para o mais tranquilo
    (vencido → urgente → atenção → OK → sem tipo de aviso por último).
  - As linhas vencida e urgente vieram com as classes CSS de destaque
    (`row-vencido`, `row-urgente`) aplicadas corretamente.
  - Sem erros de JavaScript no console relacionados à aplicação (os únicos
    erros 403 registrados são do CDN do Chart.js bloqueado no ambiente de
    teste, já esperado e sem relação com este módulo).

---

### Etapa 5 — Módulo Admissões vira painel de acompanhamento de processo

**Pedido do usuário:** transformar o módulo Admissões (que até aqui só
mostrava um total simples de "Finalizadas"/"Pendentes" a partir da coluna
`STATUS`) em um painel de acompanhamento de processo, com cards por status,
tabela detalhada, linha do tempo do processo, busca e filtros — para que
gerentes e supervisores acompanhem o andamento de cada admissão sem precisar
perguntar ao RH.

**Decisão de arquitetura mais importante desta etapa:** nenhuma planilha
nova foi criada. A coluna `STATUS` da `BASE_ADMISSOES` já existente passou a
ser **classificada** (não só exibida como texto livre) em um dos 5 estágios
conhecidos do processo, via uma nova função `classificarStatusAdmissao()` —
no mesmo padrão de `classificarPrazoRescisao()` da Etapa 4: `Utils.normalize()`
+ `includes()`, tolerante a acento/caixa. O valor legado `"FINALIZADO"`
(usado antes desta etapa) continua sendo reconhecido como "Admissões
concluídas", então nenhum dado antigo fica sem classificação.

**Os 5 estágios (cores reaproveitadas da paleta semântica já existente,
sem nenhum token novo):**
- **Aguardando documentação** (cinza/neutro) — início do processo.
- **Exame pendente** (amarelo/aviso).
- **Cadastro pendente** (laranja/urgente) — mais perto da conclusão.
- **Admissões concluídas** (verde/sucesso).
- **Cancelar** (vermelho/perigo) — estado terminal à parte, fora da
  progressão normal dos 4 estágios acima.
- Texto de `STATUS` vazio ou não reconhecido → "Status não informado"
  (neutro), mesma filosofia da Etapa 4: nunca inventar um estágio.

**O que foi entregue:**
- `js/script.js`:
  - Nova seção de helpers **"5d. Helpers do módulo de Admissões"**:
    `ADMISSAO_STATUS_STAGES` (os 4 estágios progressivos, nessa ordem),
    `ADMISSAO_STATUS_CANCELADO`, `classificarStatusAdmissao()`,
    `buildAdmissoesProcessadas()` (enriquece cada linha com `STATUS_INFO`/
    `STATUS_LABEL`), `admissaoStatusCard`/`admissaoStatusGrid` (cards
    clicáveis — clicar filtra a tabela por aquele status; clicar de novo no
    mesmo card remove o filtro), `buildProcessTimeline()` (stepper
    horizontal com os 4 estágios; se cancelado, mostra os mesmos 4 estágios
    apagados com um aviso de cancelamento no topo — a planilha não registra
    em qual estágio o cancelamento ocorreu) e `openAdmissaoDetail()` (monta
    o conteúdo do modal de detalhe a partir de um registro).
  - Novo **modal genérico** (`openModal`/`closeModal`, na seção "5. Helpers
    de montagem de view", não específico de nenhum módulo): overlay +
    painel, fecha ao clicar fora, no botão "X" ou na tecla Esc. Construído
    inteiramente via JS (sem `<template>` novo em `index.html`) e anexado a
    `document.body` só enquanto aberto — reaproveitável por qualquer módulo
    futuro que precise de um detalhe/drawer.
  - `dataTableCard()` ganhou um segundo parâmetro opcional (além do
    `rowClass` da Etapa 4): **`onRowClick`** — função `(row) => void`
    chamada ao clicar numa linha. Todos os módulos que não passam esse
    parâmetro continuam funcionando exatamente como antes.
  - Novos helpers genéricos: `sortByDateAsc()` (ordena pela data mais
    próxima primeiro — usada aqui pela "Data prevista"; distinta da
    `sortByDateDesc()` já existente, usada pelas tabelas de "mais
    recentes").
  - `renderAdmissoes()` reescrita por completo: 5 cards de status clicáveis
    (contagem calculada sobre os demais filtros ativos, exceto o próprio
    filtro de status — assim os cards continuam mostrando a distribuição
    completa mesmo com um status selecionado), barra de filtros (Loja,
    Supervisor, Gerente, Função, Mês, Status, busca por Colaborador),
    tabela com as colunas Nome/Loja/Supervisor/Gerente/Função/Status/Data
    prevista (ordenada pela data prevista mais próxima primeiro) e clique
    na linha abrindo o modal com a linha do tempo do processo. A seção
    "Tendências" (gráficos-placeholder por loja/função) foi mantida sem
    alteração.
- `css/style.css`:
  - Nova seção **"15. Módulo de Admissões"**: `.status-card-grid` /
    `.status-card` (com variantes `--neutral/--warning/--urgent/--success/
    --danger` e estado `--active`), `.modal-overlay` / `.modal-panel` (+
    subcomponentes de cabeçalho, corpo e grid de informações) e
    `.process-timeline` (stepper com estados `--done/--current/--cancelled`
    e conectores).
  - Nova classe utilitária `.row-clickable` (cursor pointer), aplicada
    automaticamente pelo `dataTableCard()` quando `onRowClick` é informado.
  - Regras de responsividade para os novos componentes (grid de cards em
    1 coluna, modal em largura total, linha do tempo empilhada
    verticalmente) adicionadas à seção "13. Responsividade" já existente.
- **`index.html` não foi alterado** — o modal é montado inteiramente via JS
  e não precisou de nenhum `<template>` novo.
- Nenhum arquivo novo foi criado.
- **Validação realizada nesta etapa:** verificação de sintaxe de todos os
  arquivos `.js` (`node --check`) e checagem de balanceamento de chaves do
  `.css` — sem ambiente de navegador disponível para um teste visual
  automatizado (Playwright) desta vez, então vale uma conferência manual
  rápida no navegador (cards clicando/desmarcando corretamente, modal
  abrindo com Esc/clique fora, tabela ordenada pela data prevista) antes de
  publicar.

### Etapa 6 — Revisão geral: "software corporativo"

**Pedido do usuário:** revisão completa e transversal do portal (não um
módulo novo), para deixá-lo com "cara" de software corporativo: animações
suaves, responsividade, tela de carregamento, persistência de filtros,
busca instantânea, botão "Atualizar dados" (já existia desde a Etapa 2),
exportação para Excel e PDF, mensagens amigáveis/estados vazios/tratamento
de erros (parte já existia desde a Etapa 2), código otimizado sem
duplicações, funções padronizadas e componentes reutilizáveis.

**Decisão de arquitetura mais importante desta etapa:** nenhuma biblioteca
externa nova foi adicionada (a restrição "só HTML/CSS/JS puro + Chart.js"
continua valendo). Exportação para Excel e PDF foram implementadas com
técnicas 100% nativas do navegador:
- **Excel**: gera um arquivo `.xls` a partir de uma tabela HTML simples,
  servida com o tipo MIME do Excel (`application/vnd.ms-excel`) — truque
  reconhecido nativamente pelo Excel e pelo Google Sheets ao abrir o
  arquivo, sem precisar de nenhuma biblioteca como SheetJS.
- **PDF**: abre uma janela nova só com a tabela formatada e chama
  `window.print()` — o usuário usa a opção "Salvar como PDF" do próprio
  diálogo de impressão do navegador.

**O que foi entregue:**
- `js/utils.js`:
  - Novo helper genérico **`filterByBusca(list, term, fields)`** —
    centraliza a lógica de "buscar por nome tolerando acento/caixa" que
    antes estava duplicada dentro do Dashboard, de Admissões e do Controle
    de Rescisões (cada um repetia o mesmo bloco de `Utils.normalize()` +
    `.filter()`).
  - Novos helpers **`storageGet(key, fallback)`/`storageSet(key, value)`**
    — wrapper seguro de `localStorage` (nunca lança exceção), usado pela
    persistência de filtros e reaproveitável por qualquer preferência de
    usuário que um módulo futuro precise lembrar.
  - Novo sistema de **notificações "toast"** (`toast(message, variant,
    duration)`), com container próprio criado sob demanda
    (`#toastContainer`), 4 variantes (success/error/warning/info) e botão
    de fechar manual.
  - Novos **`exportToExcel({ filename, columns, rows })`** e
    **`exportToPDF({ title, columns, rows })`** — geração de tabela HTML
    reaproveitada pelos dois, sem dependência externa (ver decisão acima).
- `js/filters.js`: debounce do campo de busca por texto reduzido de 350ms
  para 200ms (configurável por campo via `field.debounce`), para a busca
  "instantânea" responder mais rápido.
- `js/script.js`:
  - **`persistFilterState(moduleId, state)`**: substitui o padrão repetido
    `filterStateByModule.x = state` (usado em 4 módulos + 2 handlers de
    clique nos cards de status de Admissões) por uma única função que
    também grava no `localStorage` (chave `rhPortal:filters:v1`). Os
    filtros agora sobrevivem a um fechar/reabrir do navegador, não só a
    uma re-renderização durante a mesma sessão (que já funcionava desde a
    Etapa 2).
  - Filtro de busca por Colaborador **adicionado ao módulo de
    Desligamentos**, que era o único módulo com filtro de texto que ainda
    não tinha esse campo (Dashboard, Admissões e Rescisões já tinham desde
    etapas anteriores) — agora os 4 módulos com dados reais seguem o mesmo
    padrão.
  - Toda a lógica de filtragem por busca dentro de `renderDashboard`,
    `renderAdmissoes`, `renderDesligamentos` e `renderRescisoes` passou a
    chamar `Utils.filterByBusca(...)` em vez de repetir o mesmo bloco de
    normalização/filtro.
  - Nova função **`exportActions({ title, columns, rows, mapRow })`**:
    monta os botões "Excel" e "PDF" do cabeçalho de qualquer tabela,
    reaproveitando o próprio `mapRow` de cada módulo (que já monta as
    células exibidas na tela) como fonte de verdade da exportação — lê o
    `textContent` de cada célula já formatada, em vez de duplicar a
    formatação de cada módulo dentro da função de exportação.
  - `dataTableCard()` reorganizado: o cabeçalho agora tem duas áreas —
    `table-card__heading` (título + contagem, como antes) e
    `table-card__actions` (botões de exportação, vazios quando a tabela
    está carregando ou sem registros). Nenhum módulo que já chamava
    `dataTableCard()` precisou mudar a forma de chamar.
  - **`hideLoadingScreen()`**: remove a tela de carregamento inicial (com
    fade) assim que a primeira leitura das 3 bases termina — chamada de
    dentro de `loadAllData()`, só na primeira carga (`isFirstLoad`).
  - **`initGlobalErrorHandling()`**: escuta `error` e `unhandledrejection`
    globais e mostra um toast amigável ("Ocorreu um erro inesperado…"),
    registrando o detalhe técnico no console — evita que um bug em
    qualquer parte do sistema deixe a tela travada/em branco sem
    explicação para quem está usando.
  - `loadAllData()` agora também dispara um toast de feedback quando o
    usuário clica em "Atualizar dados" manualmente (sucesso/parcial/falha,
    de acordo com `GoogleSheets.getOverallStatus()`) — na carga automática
    inicial isso não acontece, para não gerar um aviso desnecessário ao
    abrir o portal.
- `index.html`: novo bloco `#appLoadingScreen` (tela de carregamento
  inicial), antes do `.app-shell`. O container de toasts
  (`#toastContainer`) é criado dinamicamente pelo próprio
  `Utils.toast()` na primeira vez que é chamado — não precisou de markup
  fixo em `index.html`.
- `css/style.css`:
  - `.table-card__header` reorganizado para acomodar `.table-card__heading`
    e `.table-card__actions` lado a lado (`justify-content: space-between`
    com `flex-wrap`, para não quebrar em telas estreitas).
  - Nova classe utilitária `.btn--sm` (botões menores, usada nos botões de
    exportação).
  - Nova seção **"16. Software corporativo"**: estilos da tela de
    carregamento (`.app-loading` + variante `--hidden` com fade),
    notificações toast (`.toast-container`/`.toast` + 4 variantes +
    animações de entrada/saída), animação de entrada ao trocar de módulo
    (`.view`) e nos cards mais comuns (`.kpi-card`, `.chart-card`,
    `.table-card`, `.ranking-card`, `.status-card`,
    `.rescisao-summary-card`) com leve escalonamento por posição no grid, e
    ajustes de responsividade específicos (toast em largura total no
    mobile, botões de exportação só com ícone em telas muito pequenas).
    Todas as animações continuam respeitando `prefers-reduced-motion`,
    já configurado globalmente desde a seção 1 do CSS (Etapa 1).
- **Validação realizada nesta etapa**: verificação de sintaxe de todos os
  arquivos `.js` (`node --check`, sem erros) e checagem de balanceamento de
  chaves do `.css` (316 aberturas / 316 fechamentos) — sem ambiente de
  navegador disponível para teste visual automatizado (Playwright) desta
  vez; vale uma conferência manual rápida no navegador antes de publicar
  (tela de carregamento some corretamente, filtros voltam depois de um
  F5, exportação Excel/PDF abre o arquivo/diálogo esperado).
- Nenhum arquivo novo foi criado; nenhuma planilha nova foi adicionada;
  nenhuma regra de negócio dos módulos existentes foi alterada.

---



- **Paleta:** fundo `#0B0F14` → `#161C25` → `#1B222D` (do mais escuro ao
  mais elevado); acento primário azul-aço `#5B8DEF`; acento secundário
  dourado `#C9A15A`; cores semânticas discretas (`--status-success`,
  `--status-danger`, `--status-warning`).
- **Tipografia:** Inter para texto/UI; JetBrains Mono só para números/KPIs
  (`font-variant-numeric: tabular-nums`).
- **Sem exageros visuais**: sem gradientes fortes, sem sombras pesadas, sem
  animações chamativas — só o essencial (pulsação sutil em loading,
  transições rápidas de 140–220ms).
- **Toda comunicação com dados externos fica isolada em `googleSheets.js`.**
  Nenhum outro arquivo deve conter `fetch()`, parsing de CSV ou URLs de
  planilha. Se pedir uma nova fonte de dados no futuro, ela deve entrar
  nesse arquivo, seguindo o mesmo padrão de retorno `{ ok, data, error,
  stale }`.
- **Um só arquivo controla os módulos do menu**: `MODULE_REGISTRY` em
  `script.js`. Novo módulo = novo item nesse array + função `render`.
- **Nomes de campo padronizados** (usados em todo o sistema, sempre em
  maiúsculas sem acento): `DATA`, `COLABORADOR`, `COLABORADOR_ABREVIADO`,
  `LOJA`, `MES`, `STATUS`, `GERENTE`, `SUPERVISOR`, `FUNCAO`, `TIPO_DOC`,
  `TIPO_AVISO`, `HEADCOUNT`.
- **Paleta de status agora tem 5 cores** (Etapa 4): sucesso (verde), aviso
  (amarelo), **urgente (laranja — novo)**, perigo (vermelho) e neutro
  (cinza). Use `--status-urgent`/`--status-urgent-dim` e a classe
  `.tag--urgent` sempre que precisar de um nível "intermediário" entre
  "Atenção" e "Vencido"/"Crítico" em módulos futuros.
- **Camada "corporativa" (Etapa 6) é transversal, não um módulo**: qualquer
  módulo futuro que use `Filters.createFilterBar()` e `dataTableCard()`
  ganha automaticamente persistência de filtros, busca instantânea
  padronizada e exportação Excel/PDF — não precisa reimplementar nada
  disso. Basta: (1) chamar `persistFilterState(moduleId, state)` no
  callback do filtro em vez de guardar o estado à mão; (2) usar
  `Utils.filterByBusca(list, busca, [...campos])` para o campo de busca por
  texto; (3) usar `dataTableCard()` normalmente — os botões de exportação
  aparecem sozinhos.
  Ele deriva seus dados de `DATASETS.desligamentos` e calcula prazos em
  `js/script.js` (seção "5c"). Se um módulo futuro precisar de uma regra de
  prazo parecida (ex: exame demissional, homologação), o padrão é o mesmo:
  funções puras de cálculo isoladas por seção, um `classificarX()` que
  devolve `{ nivel, label, variant }`, e reaproveitar `dataTableCard({
  rowClass })` para destacar linhas críticas.

---

## 4. Estrutura de arquivos atual (completa)

```
index.html                      → shell da aplicação (sidebar, header, templates)
css/
  style.css                     → CSS único, organizado em 13+ seções comentadas
js/
  utils.js                      → helpers puros (DOM, formatação, debounce) — sem dependências
  googleSheets.js                → ÚNICA camada de comunicação com o Google Sheets
  filters.js                     → motor de filtros genérico (usado por todos os módulos)
  charts.js                      → camada de gráficos (Chart.js plugado, hoje só placeholders)
  script.js                      → núcleo: MODULE_REGISTRY, roteador, sidebar, renderização das views
assets/
  icons/icons.svg                → biblioteca de ícones (sprite de referência, não usado em runtime)
  components/                    → HTML estático de referência (não carregado pela app)
    README.md                    → guia de como criar um módulo novo
    kpi-card.html
    filter-bar.html
    module-template.html
README.md                        → guia de uso, arquitetura e deploy (para quem for mexer no código)
HISTORICO_DO_PROJETO.md          → este arquivo (registro de decisões e mudanças)
```

**Ordem de carregamento dos scripts (importa!)**, definida em `index.html`:
`utils.js` → `googleSheets.js` → `filters.js` → `charts.js` → `script.js`.

---

## 5. Esquema das bases de dados (mapeamento de colunas)

Descoberto a partir do arquivo `BASE_ADMISSÕES_E_DEMISSÕES_FINAL.xlsx`
enviado pelo usuário na Etapa 1, e usado como referência para configurar o
mapeamento posicional em `googleSheets.js` na Etapa 2.

**Aba/CSV de Admissões** (9 colunas, nessa ordem exata):
```
DATA | COLABORADOR | COLABORADOR (abreviado) | LOJA | MÊS | STATUS | GERENTE | SUPERVISOR | FUNÇÃO
```
→ mapeado para: `DATA, COLABORADOR, COLABORADOR_ABREVIADO, LOJA, MES, STATUS, GERENTE, SUPERVISOR, FUNCAO`

**Aba/CSV de Desligamentos** (10 colunas, nessa ordem exata):
```
COLABORADOR | COLABORADOR (abreviado) | TIPO_DOC | TIPO_AVISO | DATA | LOJA | MÊS | GERENTE | SUPERVISOR | FUNÇÃO
```
→ mapeado para: `COLABORADOR, COLABORADOR_ABREVIADO, TIPO_DOC, TIPO_AVISO, DATA, LOJA, MES, GERENTE, SUPERVISOR, FUNCAO`

**Aba/CSV de Lojas** (2 colunas):
```
LOJA | HEADCOUNT
```

**Observações importantes:**
- Se a ordem das colunas mudar na planilha de origem, é preciso ajustar os
  arrays `ADMISSOES_FIELDS`, `DESLIGAMENTOS_FIELDS` e `LOJAS_FIELDS` no
  topo de `js/googleSheets.js` — é o único lugar que precisa mudar.
- A coluna `LOJA` é tratada como texto (existem lojas numéricas como "1",
  "2" e também "CD", "ADM").
- `DATA` aceita formato ISO (`2026-06-01`) ou brasileiro (`01/06/2026`).
- `MÊS` vem como abreviação de 3 letras (`JAN`, `FEV`, ... `DEZ`).

---

## 6. O que ainda NÃO foi feito (pendências conhecidas)

- **Gráficos reais só estão ativos no Dashboard Executivo** (Etapa 3). Os
  módulos de Admissões, Desligamentos e Rescisões ainda usam
  `Charts.renderPlaceholder(...)` — bastar trocar pelas mesmas funções já
  usadas no dashboard (`Charts.renderBarChart` etc., seguindo o padrão de
  `realChartGrid`/`buildChartCard` em `script.js`) quando esses módulos
  também precisarem de gráficos de verdade. O Controle de Rescisões (Etapa
  4) poderia ganhar, por exemplo, um gráfico de barras de "processos por
  nível de risco" ou "por loja", seguindo esse mesmo padrão.
- **O KPI "Rescisões em andamento" do Dashboard Executivo continua
  mostrando "—" / "Base ainda não conectada"** — ele lê
  `GoogleSheets.fetchRescisoes()`, que continua sendo um stub (Etapa 2).
  Ele **não** foi religado ao cálculo novo da Etapa 4 de propósito, para
  não alterar o comportamento do Dashboard Executivo sem um pedido
  explícito para isso. Se desejado, um próximo passo natural é trocar essa
  leitura por `buildRescisoes(DATASETS.desligamentos.data)` e contar
  quantas estão nos níveis "Urgente"/"Vencido".
- **Nenhum dos 8 módulos futuros (Férias, Banco de Horas, Turnover,
  Absenteísmo, Treinamentos, Indicadores do CD, Auditorias, Documentos) foi
  implementado** — eles só existem como itens desabilitados ("Em breve") no
  menu, conforme escopo original.
- Não há autenticação/controle de acesso (fora do escopo definido até
  agora).

---

## 7. Como retomar o trabalho em uma conversa nova

Se você perder o histórico deste chat, para continuar de onde parou:

1. Envie os arquivos do projeto atual (o `.zip` ou os arquivos individuais)
   e este arquivo `HISTORICO_DO_PROJETO.md` para o Claude.
2. Diga o que você quer fazer a seguir (ex: "ative os gráficos do
   dashboard usando os dados já integrados" ou "crie o módulo de Turnover
   seguindo o padrão do projeto").
3. Não é necessário reexplicar as regras técnicas (sem React/Vue/jQuery
   etc.) nem a arquitetura — este documento já cobre isso, e o próprio
   código está comentado seguindo essas decisões.
4. As URLs das planilhas do Google Sheets já estão salvas em
   `js/googleSheets.js` — não é necessário reenviá-las, a menos que
   mudem.

---

## 7b. Controle de Rescisões: painel "Modalidades & Dicas de Gestão"

**Pedido do usuário:** adicionar, dentro do Controle de Rescisões, uma área
explicando as modalidades de rescisão previstas na CLT, além de dicas que
ajudassem no lucro da empresa (melhores dias para desligar, modalidade mais
vantajosa, alerta de modalidade que a empresa sai perdendo), usando
livremente conceitos de administradores famosos.

**O que foi entregue:**
- O módulo ganhou duas abas (`.view-tab-bar`, componente genérico): "Processos
  em aberto" (o que já existia, sem nenhuma alteração de comportamento) e
  "Modalidades & Dicas de Gestão" (novo, 100% de referência — não depende de
  planilha nenhuma).
- 7 cards de modalidade (sem justa causa, justa causa, pedido de demissão,
  acordo mútuo/Art. 484-A, rescisão indireta, término de contrato de
  experiência/prazo determinado, aposentadoria), cada um com badge de custo
  típico e um modal de detalhe (direitos envolvidos, base legal, leitura de
  gestão) — dados em `MODALIDADES_RESCISAO`.
- Um "termômetro de custo" (barras comparando o custo típico de cada
  modalidade) e dois alertas estratégicos reaproveitando `alertBanner()`:
  "Onde a empresa mais ganha" (acordo mútuo em desligamentos consensuais) e
  "Onde a empresa mais perde" (rescisão indireta e simulação de modalidades
  — que, no fim, aumenta o risco/custo em vez de reduzir).
- 6 cards de dica de gestão (`DICAS_GESTAO_RESCISAO`), cada um citando o
  conceito de administração aplicado: Peter Drucker (eficiência ×
  eficácia), Vicente Falconi (PDCA/gestão à vista), Ricardo Semler
  (Semco — soluções negociadas), Jack Welch (diferenciação de performance
  e curva de vitalidade) e Ichak Adizes (ciclo de vida organizacional).

**Decisões de conteúdo/precisão:**
- As informações legais (CLT arts. 477, 482, 483, 484-A, 487; Lei
  12.506/2011; Lei 8.213/1991) foram checadas antes de escrever, incluindo
  uma busca específica sobre o Art. 484-A para confirmar que a regra de
  multa de FGTS de 20%/saque de 80%/sem seguro-desemprego segue vigente em
  2026 (nenhuma mudança desde a Reforma Trabalhista de 2017).
- O painel deixa claro, em rodapé, que é conteúdo educativo/geral e não
  substitui a análise do jurídico/contábil da empresa em casos concretos —
  a lei muda conforme convenção coletiva, tempo de casa e histórico do
  colaborador, o que um dashboard genérico não tem como capturar.
- Nenhuma dica sugere práticas de simulação/fraude (ex: disfarçar dispensa
  sem justa causa como pedido de demissão ou acordo) — pelo contrário, o
  conteúdo alerta explicitamente contra isso, por ser ilegal e mais caro no
  fim (reversão judicial retroativa + dano moral).
- **Novos ícones inline** adicionados ao mapa `ICONS` (`js/script.js`):
  `lightbulb`, `coin`, `trendUp`, `trendDown`, `scale` — seguindo o mesmo
  padrão de path SVG 24×24 dos ícones existentes, sem depender de
  `icons/icons.svg` (que só é usado pela sidebar).

**Testado com Playwright** (script descartável, não faz parte do projeto):
abrir o módulo, alternar para a aba nova, abrir o modal de detalhe de uma
modalidade — sem erros de JavaScript além dos já esperados de CORS ao
tentar buscar as planilhas via `file://`.

---

## 8. Como publicar (recapitulando)

1. Suba todos os arquivos deste projeto para a raiz de um repositório no
   GitHub.
2. **Settings → Pages → Source** → branch `main`, pasta `/ (root)`.
3. A URL final será algo como
   `https://seu-usuario.github.io/nome-do-repositorio/`.
4. Como as planilhas são publicadas via "Publicar na Web", a leitura
   funciona direto do navegador do usuário final, sem precisar de backend.
