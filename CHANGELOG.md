# Changelog — Portal de RH

Todas as mudanças relevantes do projeto são registradas aqui, por versão.
Para o histórico narrativo completo (decisões, testes, raciocínio por trás
de cada escolha), veja `HISTORICO_DO_PROJETO.md`.

## [Não lançado] — Controle de Rescisões: painel "Modalidades & Dicas de Gestão"

### Adicionado
- **Abas no módulo de Controle de Rescisões** (`js/script.js`, `renderRescisoes`):
  a tela agora tem duas abas — "Processos em aberto" (comportamento original,
  inalterado) e "Modalidades & Dicas de Gestão" (nova). Componente genérico
  `.view-tab-bar` (`css/style.css`), reaproveitável por qualquer módulo futuro.
- **Modalidades de rescisão explicadas**: 7 cards (Dispensa sem justa causa,
  Dispensa por justa causa, Pedido de demissão, Rescisão por acordo — Art.
  484-A, Rescisão indireta, Término de contrato de experiência/prazo
  determinado, Aposentadoria), cada um com quem pode iniciar, resumo, nível
  de custo típico (badge) e um botão "Ver detalhes completos" que abre um
  modal com os direitos envolvidos, a base legal e uma leitura de gestão.
  Dados em `MODALIDADES_RESCISAO`, componentes `modalidadeCard()` /
  `modalidadeGrid()` / `modalidadeDetalheBody()` (`js/script.js`).
- **Termômetro de custo** (`custoTermometro()`): comparação visual (barras)
  do custo típico de cada modalidade para a empresa, da mais barata para a
  mais cara.
- **Alertas estratégicos**: "Onde a empresa mais ganha" (destaca o Acordo
  Mútuo/484-A em desligamentos consensuais) e "Onde a empresa mais perde"
  (alerta sobre Rescisão Indireta e simulação de modalidades), reaproveitando
  o componente `alertBanner()` já existente.
- **Dicas de gestão para o desligamento** (`DICAS_GESTAO_RESCISAO`,
  `dicaCard()` / `dicaGrid()`): 6 dicas práticas (timing do desligamento,
  checagem de estabilidade provisória, medição de custo antes de decidir,
  priorização do acordo mútuo, justa causa como último recurso documentado,
  antecipação de baixa performance), cada uma citando o conceito de
  administração aplicado (Peter Drucker, Vicente Falconi, Ricardo Semler,
  Jack Welch, Ichak Adizes).
- Novos ícones inline no mapa `ICONS`: `lightbulb`, `coin`, `trendUp`,
  `trendDown`, `scale`.
- Aviso de rodapé deixando claro que o conteúdo é educativo/geral e não
  substitui a análise do jurídico/contábil da empresa em casos concretos.

Conteúdo é 100% de referência (não depende de nenhuma planilha) — só a aba
"Processos em aberto" continua consumindo a base de Desligamentos, como antes.

## [Não lançado] — Correção: sinalização de vencido em desligamentos já finalizados

### Corrigido
- **Alerta e status "Vencido" ignoravam a coluna STATUS**: em Desligamentos e
  em Controle de Rescisões, `buildRescisoes()` (`js/script.js`) calculava o
  nível de risco (`STATUS_RESCISAO`) só pela data limite, então um registro
  com `STATUS = "Finalizado"` continuava contando como vencido/urgente no
  banner de alerta, nos KPIs e no realce vermelho da linha, mesmo já pago e
  encerrado. Agora, quando `STATUS` contém "Finalizado", o registro recebe
  o nível `FINALIZADO` (rótulo "Pago e encerrado", cor verde) e sai das
  contagens de vencidos/urgentes e do banner de alerta em ambos os módulos.
  A coluna "Vencimento" (Desligamentos) e "Dias Restantes" (Controle de
  Rescisões) também param de exibir "Vencido há X dia(s)"/"X dia(s) em
  atraso" para esses registros.

## [Não lançado] — Software corporativo (revisão geral de UX/robustez)

Revisão transversal do portal inteiro (não é um módulo novo), pedida para
deixá-lo com "cara" de software corporativo: animações, exportação,
persistência de filtros, tratamento de erros e otimizações de código.
Nenhuma funcionalidade existente foi removida ou alterada em seu
comportamento — tudo abaixo é aditivo.

### Adicionado
- **Tela de carregamento inicial** (`#appLoadingScreen`, `index.html`):
  cobre a tela inteira até a primeira leitura das 3 bases terminar, depois
  desaparece com uma transição suave (fade). Controlada por
  `hideLoadingScreen()` em `js/script.js`.
- **Persistência de filtros entre sessões**: os filtros escolhidos pelo
  usuário agora são salvos no `localStorage` (chave
  `rhPortal:filters:v1`), não só durante a sessão atual (como já acontecia
  ao clicar em "Atualizar dados"). Fechar a aba e abrir de novo mantém a
  mesma seleção de filtros em cada módulo. Implementado em
  `persistFilterState()` (`js/script.js`), que substitui o padrão repetido
  `filterStateByModule.x = state` usado em cada módulo.
- **Exportar para Excel** e **Exportar para PDF**: dois botões novos no
  cabeçalho de toda tabela do sistema (Admissões, Desligamentos, Controle
  de Rescisões), via `exportActions()`/`dataTableCard()` em `js/script.js`
  e `Utils.exportToExcel()`/`Utils.exportToPDF()` em `js/utils.js`.
  Implementado 100% em JavaScript puro, sem nenhuma biblioteca externa:
  - Excel: gera um arquivo `.xls` (tabela HTML servida com o tipo MIME do
    Excel), que abre direto no Excel ou Google Sheets.
  - PDF: abre a janela de impressão do navegador com a tabela formatada;
    o usuário escolhe "Salvar como PDF" no próprio diálogo do navegador.
  - Reaproveita o `mapRow` que cada tabela já usa para desenhar as células
    na tela como fonte de verdade da exportação (lendo o texto já
    formatado), em vez de duplicar a formatação de cada módulo.
- **Notificações "toast"** (`Utils.toast()`, `js/utils.js`): feedback
  rápido e não bloqueante para ações do usuário — "Dados atualizados com
  sucesso" (e variantes parcial/falha) ao clicar em "Atualizar dados",
  confirmação ao exportar uma tabela, e aviso amigável em caso de erro
  inesperado em qualquer parte do sistema (novo tratamento global de erros
  em `initGlobalErrorHandling()`, `js/script.js`).
- **Busca instantânea padronizada** em todos os módulos que têm filtro por
  Colaborador (Dashboard, Admissões, Desligamentos, Rescisões), incluindo o
  módulo de **Desligamentos, que ainda não tinha esse filtro** e passou a
  ganhá-lo nesta versão. O atraso do debounce da busca foi reduzido de
  350ms para 200ms (`js/filters.js`) para a busca responder mais rápido.
- **Animações suaves**: transição de entrada ao trocar de módulo (`.view`)
  e nos cards mais comuns (KPI, gráfico, tabela, ranking, status,
  resumo de rescisão) — ver seção "16. Software corporativo" em
  `css/style.css`. Todas respeitam `prefers-reduced-motion` (já configurado
  na seção 1 do CSS desde a Etapa 1).
- **Novo utilitário genérico `Utils.filterByBusca()`** (`js/utils.js`):
  centraliza a lógica de "buscar por nome tolerando acento/caixa" que antes
  estava duplicada dentro de cada módulo (Dashboard, Admissões, Rescisões).
- **Novos utilitários genéricos `Utils.storageGet()`/`Utils.storageSet()`**
  (`js/utils.js`): wrapper seguro de `localStorage` (nunca lança exceção),
  usado pela persistência de filtros e reaproveitável por qualquer módulo
  futuro que precise lembrar uma preferência do usuário.

### Otimizado / refatorado (sem alterar comportamento)
- Lógica de busca por Colaborador (antes duplicada em 3 módulos) unificada
  em `Utils.filterByBusca()`.
- Gravação do estado de filtro (antes repetida em 4 módulos + 2 cliques de
  card) unificada em `persistFilterState()`.
- `table-card__header` reorganizado em `table-card__heading` (título +
  contagem) e `table-card__actions` (Excel/PDF), mantendo o layout visual
  anterior em telas que não usam os novos botões (ex: quando a tabela está
  vazia ou carregando, a área de ações fica em branco, sem "pular" o
  layout).

### Não alterado (propositalmente)
- Nenhuma regra de negócio dos módulos existentes (cálculo de prazo de
  rescisão, classificação de status de admissão, mapeamento de colunas do
  Google Sheets etc.) foi alterada.
- `js/googleSheets.js` e `js/charts.js` não precisaram de nenhuma mudança.

---

## [Não lançado] — Módulo Admissões (painel de acompanhamento de processo)

### Adicionado
- **Painel de acompanhamento de processo no módulo Admissões** (antes só
  mostrava um total simples de "Finalizadas"/"Pendentes"):
  - Classificação automática da coluna `STATUS` (BASE_ADMISSOES) em 5
    estágios conhecidos: `Aguardando documentação`, `Exame pendente`,
    `Cadastro pendente`, `Admissões concluídas` (reconhece também o valor
    legado `FINALIZADO`) e `Cancelar`.
  - 5 cards de status **clicáveis** — clicar filtra a tabela por aquele
    status; clicar de novo remove o filtro. Contagem de cada card reflete
    os demais filtros ativos (Loja/Supervisor/Gerente/Função/Mês/busca),
    exceto o próprio filtro de status.
  - Tabela com as colunas Nome, Loja, Supervisor, Gerente, Função, Status
    (tag colorida) e Data prevista, ordenada pela data prevista mais
    próxima primeiro.
  - Busca por nome do colaborador e filtros por Loja, Supervisor, Gerente,
    Função, Mês e Status.
  - Clique em qualquer linha da tabela abre um **modal com a linha do
    tempo do processo** (stepper dos 4 estágios); se o processo foi
    cancelado, os 4 estágios aparecem apagados com um aviso de
    cancelamento no topo.
- Novo **modal genérico** (`openModal`/`closeModal`, em `js/script.js`),
  não específico do módulo de Admissões — reaproveitável por qualquer
  módulo futuro que precise de um detalhe/drawer. Fecha ao clicar fora, no
  botão "X" ou na tecla Esc.
- Novo parâmetro opcional `onRowClick` em `dataTableCard()`
  (`js/script.js`) — permite reagir a cliques em linhas de qualquer
  tabela sem alterar o comportamento dos módulos que já usam essa função
  (mesmo padrão retrocompatível do `rowClass`, adicionado na versão
  anterior).
- Novo helper genérico `sortByDateAsc()` (`js/script.js`) — ordena pela
  data mais próxima primeiro; complementa o `sortByDateDesc()` já
  existente.
- Nova seção **"15. Módulo de Admissões"** em `css/style.css`:
  `.status-card-grid`/`.status-card` (5 variantes de cor + estado
  `--active`), `.modal-overlay`/`.modal-panel` e `.process-timeline`
  (stepper com estados `--done/--current/--cancelled`). Nova classe
  utilitária `.row-clickable`. Regras de responsividade correspondentes
  adicionadas à seção "13. Responsividade" já existente.

### Não alterado (propositalmente)
- A seção "Tendências" do módulo Admissões (gráficos-placeholder por loja
  e por função) foi mantida sem alteração — ainda não foi pedido para
  ativar gráficos reais neste módulo.
- Nenhum outro módulo (Dashboard, Desligamentos, Rescisões) foi modificado
  além da extensão retrocompatível de `dataTableCard()`.
- `index.html` não foi alterado — o modal é montado inteiramente via JS.

---

## [Não lançado] — Módulo Controle de Rescisões

### Adicionado
- **Módulo Controle de Rescisões, funcional** (antes era só um aviso de
  "base não conectada"):
  - Cálculo automático do prazo de pagamento da rescisão a partir da coluna
    `TIPO_AVISO` da base de Desligamentos:
    - `TRABALHADO` → 39 dias (30 de aviso + 9 após a projeção).
    - `INDENIZADO` → 10 dias.
    - `DISPENSA DE AVISO` → 10 dias.
  - Cálculo automático de **Data Limite** e **Dias Restantes** a partir da
    Data Inicial (data do desligamento).
  - 4 níveis de status com cores: **Prazo OK** (verde), **Atenção**
    (amarelo), **Urgente** (laranja), **Vencido** (vermelho).
  - Banner de alerta imediato quando existem rescisões vencidas ou
    urgentes, visível ao abrir o módulo.
  - 4 cards de resumo: Rescisões vencidas, Urgentes (até 5 dias), Vencendo
    em até 15 dias, Vencendo em até 30 dias.
  - Tabela com Nome, Loja, Supervisor, Gerente, Função, Tipo de Aviso, Data
    Inicial, Prazo Final, Dias Restantes e Status — ordenada automaticamente
    do mais urgente para o mais tranquilo.
  - Destaque visual (cor de fundo + borda) nas linhas vencidas/urgentes da
    tabela.
  - Filtros por Loja, Supervisor, Gerente, Função, Tipo de Aviso, Status do
    prazo e busca por nome do colaborador.
- Novo token de cor `--status-urgent` (laranja, `#DB7F3B`) e a classe
  `.tag--urgent`, em `css/style.css`, para o nível "Urgente".
- Novo parâmetro opcional `rowClass` em `dataTableCard()`
  (`js/script.js`) — permite destacar linhas específicas de qualquer tabela
  sem alterar o comportamento dos módulos que já usam essa função.

### Decisão de arquitetura
- O Controle de Rescisões **não recebeu planilha própria**. Ele reaproveita
  a leitura já existente da base de Desligamentos (`DATASETS.desligamentos`),
  já que ela contém todos os campos necessários (`TIPO_AVISO`, `DATA`,
  `COLABORADOR`, `LOJA`, `GERENTE`, `SUPERVISOR`, `FUNCAO`). Nenhum arquivo
  novo foi criado, nenhuma URL nova foi adicionada a `SHEET_URLS`.

### Não alterado (propositalmente)
- O KPI "Rescisões em andamento" do Dashboard Executivo continua lendo
  `GoogleSheets.fetchRescisoes()` (stub, retorna vazio) — não foi religado
  ao novo cálculo nesta versão, para preservar o comportamento atual do
  Dashboard sem um pedido explícito para alterá-lo.
- Nenhum outro módulo (Dashboard, Admissões, Desligamentos) foi modificado
  além da extensão retrocompatível de `dataTableCard()`.

---

## Versões anteriores

O trabalho anterior a esta versão (scaffold do portal, integração com
Google Sheets, Dashboard Executivo com KPIs/gráficos/rankings) está
totalmente descrito em `HISTORICO_DO_PROJETO.md`, seções "Etapa 1" a
"Etapa 3". Este changelog passa a existir a partir desta versão; as etapas
anteriores não foram retroativamente convertidas para este formato para
evitar duplicar informação já documentada.
