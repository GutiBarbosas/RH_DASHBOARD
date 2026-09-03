/* ============================================================================
   SCRIPT.JS
   ----------------------------------------------------------------------------
   Núcleo da aplicação (SPA sem framework):
     - MODULE_REGISTRY: fonte única de verdade sobre os módulos do portal.
     - Router: baseado em hash (#dashboard, #admissoes, ...), sem reload.
     - Sidebar: construída dinamicamente a partir do MODULE_REGISTRY.
     - Consome js/googleSheets.js (única fonte de dados) e re-renderiza a
       view ativa sempre que uma base termina de carregar/atualizar.
   Este arquivo NUNCA faz fetch/parsing diretamente — toda comunicação com
   o Google Sheets fica isolada em googleSheets.js.

   Recursos "corporativos" adicionados nesta versão (ver CHANGELOG.md):
     - Tela de carregamento inicial (#appLoadingScreen), escondida com fade
       assim que a primeira carga de dados termina (ver hideLoadingScreen()).
     - Persistência de filtros em localStorage (persistFilterState()), que
       substitui o padrão repetido "filterStateByModule.x = state" em cada
       módulo — os filtros agora sobrevivem a um fechar/reabrir do navegador.
     - Busca instantânea padronizada via Utils.filterByBusca() (elimina a
       duplicação de lógica de busca que existia em cada módulo).
     - Exportação para Excel/PDF em qualquer tabela, via exportActions() e
       dataTableCard() — sem nenhuma biblioteca externa.
     - Notificações "toast" (Utils.toast) para ações do usuário (atualizar
       dados, exportar) e tratamento global de erros inesperados.
   ============================================================================ */

(function App() {

  /* --------------------------------------------------------------------
   * 0. ESTADO GLOBAL DA APLICAÇÃO
   * ------------------------------------------------------------------ */
  const MESES_ORDER = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  // Último resultado conhecido de cada base: { data, ok, error, stale }
  const DATASETS = {
    admissoes: { data: [], ok: false, error: null, stale: false },
    desligamentos: { data: [], ok: false, error: null, stale: false },
    lojas: { data: [], ok: false, error: null, stale: false },
    rescisoes: { data: [], ok: false, error: null, stale: false },
    ferias: { data: [], ok: false, error: null, stale: false },
    quebraCaixa: { data: [], ok: false, error: null, stale: false },
    lojaFuncao: { data: [], ok: false, error: null, stale: false },
    saldoDia: { data: [], ok: false, error: null, stale: false },
    saldoTotal: { data: [], ok: false, error: null, stale: false },
    absenteismo: { data: [], ok: false, error: null, stale: false },
  };

  // Chave usada para persistir os filtros escolhidos pelo usuário no localStorage.
  const FILTER_STORAGE_KEY = 'rhPortal:filters:v1';

  // Preserva a seleção de filtros do usuário entre re-renderizações (ex: após
  // "Atualizar dados") E entre sessões (fechar/reabrir o navegador), já
  // hidratado a partir do localStorage na inicialização deste módulo.
  const filterStateByModule = Utils.storageGet(FILTER_STORAGE_KEY, {}) || {};

  /**
   * Atualiza o estado de filtro em memória de um módulo E grava no
   * localStorage, para que a mesma seleção volte a aparecer mesmo depois de
   * fechar a aba. Substitui o antigo padrão repetido em cada módulo
   * (`filterStateByModule.x = state`), centralizando a persistência num só
   * lugar (ver Etapa "Software Corporativo" no CHANGELOG).
   */
  function persistFilterState(moduleId, state) {
    filterStateByModule[moduleId] = state;
    Utils.storageSet(FILTER_STORAGE_KEY, filterStateByModule);
  }

  let currentModuleId = null;
  let hasLoadedOnce = false;


  /* --------------------------------------------------------------------
   * 1. ÍCONES (inline, para não depender de fetch/CORS em file://)
   * ------------------------------------------------------------------ */
  const ICONS = {
    dashboard: 'M4 13H10V4H4V13ZM4 20H10V15H4V20ZM12 20H20V11H12V20ZM12 4V9H20V4H12Z',
    admissoes: 'M16 21V19C16 16.7909 14.2091 15 12 15H6C3.79086 15 2 16.7909 2 19V21M23 21V19C23 17.1362 21.7252 15.5701 20 15.126M16 3.13C17.7252 3.5701 19 5.13616 19 7C19 8.86384 17.7252 10.4299 16 10.87M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z',
    desligamentos: 'M18 6L6 18M6 6L18 18',
    rescisoes: 'M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z',
    ferias: 'M12 3V5M12 19V21M5 12H3M21 12H19M18.36 18.36L16.95 16.95M18.36 5.64L16.95 7.05M5.64 18.36L7.05 16.95M5.64 5.64L7.05 7.05M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z',
    bancoHoras: 'M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z',
    turnover: 'M17 2L21 6L17 10M3 12V10C3 8.93913 3.42143 7.92172 4.17157 7.17157C4.92172 6.42143 5.93913 6 7 6H21M7 22L3 18L7 14M21 12V14C21 15.0609 20.5786 16.0783 19.8284 16.8284C19.0783 17.5786 18.0609 18 17 18H3',
    absenteismo: 'M8 2V5M16 2V5M3.5 9H20.5M5 4H19C20.1046 4 21 4.89543 21 6V20C21 21.1046 20.1046 22 19 22H5C3.89543 22 3 21.1046 3 20V6C3 4.89543 3.89543 4 5 4ZM12 12L9 15M9 12L12 15',
    treinamentos: 'M12 14L3 9L12 4L21 9L12 14ZM12 14V20M5 11V16.5C5 16.5 7.5 19 12 19C16.5 19 19 16.5 19 16.5V11',
    indicadoresCD: 'M3 3V21H21M7 15L11 11L14 14L20 8',
    auditorias: 'M11 3C15.4183 3 19 6.58172 19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3ZM21 21L16.65 16.65',
    documentos: 'M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2ZM14 2V8H20M9 13H15M9 17H15',
    warning: 'M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z',
    error: 'M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z',
    close: 'M18 6L6 18M6 6L18 18',
    calendar: 'M8 2V5M16 2V5M3.5 9H20.5M5 4H19C20.1046 4 21 4.89543 21 6V20C21 21.1046 20.1046 22 19 22H5C3.89543 22 3 21.1046 3 20V6C3 4.89543 3.89543 4 5 4Z',
    // --- Ícones do painel "Modalidades & Dicas de Gestão" (Controle de Rescisões) ---
    lightbulb: 'M9 18H15M10 21H14M12 3C8.68629 3 6 5.68629 6 9C6 11.3798 7.19029 13.4794 9 14.7439V17H15V14.7439C16.8097 13.4794 18 11.3798 18 9C18 5.68629 15.3137 3 12 3Z',
    coin: 'M12 1V23M17 5H9.5C8.11929 5 7 6.11929 7 7.5C7 8.88071 8.11929 10 9.5 10H14.5C15.8807 10 17 11.1193 17 12.5C17 13.8807 15.8807 15 14.5 15H7',
    trendUp: 'M23 6L13.5 15.5L8.5 10.5L1 18M23 6H17M23 6V12',
    trendDown: 'M23 18L13.5 8.5L8.5 13.5L1 6M23 18H17M23 18V12',
    scale: 'M12 3V21M12 3L6 6M12 3L18 6M4 8L2 13C2 14.6569 3.34315 15 5 15C6.65685 15 8 14.6569 8 13L6 8M18 8L16 13C16 14.6569 17.3431 15 19 15C20.6569 15 22 14.6569 22 13L20 8M4 8H8M16 8H20M7 21H17',
  };

  function iconEl(pathKey, size = 18) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[pathKey] || ICONS.dashboard);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }


  /* --------------------------------------------------------------------
   * 2. MODULE REGISTRY — fonte única de verdade dos módulos do portal
   * ------------------------------------------------------------------ */
  const MODULE_REGISTRY = [
    { id: 'dashboard', label: 'Dashboard Executivo', icon: 'dashboard', group: 'Principal', status: 'active', render: renderDashboard },
    { id: 'admissoes', label: 'Admissões', icon: 'admissoes', group: 'Gestão de Pessoas', status: 'active', render: renderAdmissoes },
    { id: 'desligamentos', label: 'Desligamentos', icon: 'desligamentos', group: 'Gestão de Pessoas', status: 'active', render: renderDesligamentos },
    { id: 'rescisoes', label: 'Controle de Rescisões', icon: 'rescisoes', group: 'Gestão de Pessoas', status: 'active', render: renderRescisoes },
    { id: 'ferias', label: 'Férias', icon: 'ferias', group: 'Gestão de Pessoas', status: 'active', render: renderFerias },
    { id: 'quebra-caixa', label: 'Quebra de Caixa', icon: 'coin', group: 'Gestão de Pessoas', status: 'active', render: renderQuebraCaixa },
    { id: 'banco-horas', label: 'Banco de Horas', icon: 'bancoHoras', group: 'Gestão de Pessoas', status: 'active', render: renderBancoHoras },
    { id: 'turnover', label: 'Turnover', icon: 'turnover', group: 'Gestão de Pessoas', status: 'active', render: renderTurnover },
    { id: 'absenteismo', label: 'Absenteísmo', icon: 'absenteismo', group: 'Gestão de Pessoas', status: 'active', render: renderAbsenteismo },
    { id: 'treinamentos', label: 'Treinamentos', icon: 'treinamentos', group: 'Em breve', status: 'soon' },
    { id: 'indicadores-cd', label: 'Indicadores do CD', icon: 'indicadoresCD', group: 'Em breve', status: 'soon' },
    { id: 'auditorias', label: 'Auditorias', icon: 'auditorias', group: 'Em breve', status: 'soon' },
    { id: 'documentos', label: 'Documentos', icon: 'documentos', group: 'Em breve', status: 'soon' },
  ];

  const DEFAULT_MODULE = 'dashboard';


  /* --------------------------------------------------------------------
   * 3. SIDEBAR — construída dinamicamente a partir do MODULE_REGISTRY
   * ------------------------------------------------------------------ */
  function buildSidebar(activeId) {
    const nav = Utils.qs('#sidebarNav');
    Utils.emptyNode(nav);

    const groupOrder = ['Principal', 'Gestão de Pessoas', 'Em breve'];
    const groups = Utils.groupBy(MODULE_REGISTRY, 'group');

    groupOrder.forEach((groupName) => {
      const items = groups[groupName];
      if (!items || items.length === 0) return;

      const groupWrap = Utils.el('div', { class: 'sidebar__nav-group' });
      groupWrap.appendChild(Utils.el('span', { class: 'sidebar__nav-group-label', text: groupName }));

      items.forEach((mod) => {
        const isActive = mod.id === activeId;
        const isSoon = mod.status === 'soon';
        const classes = ['nav-item'];
        if (isActive) classes.push('is-active');
        if (isSoon) classes.push('is-disabled');

        const children = [
          Utils.el('span', { class: 'nav-item__icon' }, [iconEl(mod.icon)]),
          Utils.el('span', { class: 'nav-item__label', text: mod.label }),
        ];
        if (isSoon) children.push(Utils.el('span', { class: 'nav-item__soon-tag', text: 'Em breve' }));

        const item = Utils.el('a', {
          class: classes.join(' '),
          href: isSoon ? undefined : `#${mod.id}`,
          'aria-current': isActive ? 'page' : undefined,
        }, children);

        if (isSoon) item.addEventListener('click', (e) => e.preventDefault());
        else item.addEventListener('click', closeMobileSidebar);

        groupWrap.appendChild(item);
      });

      nav.appendChild(groupWrap);
    });
  }


  /* --------------------------------------------------------------------
   * 4. ROTEADOR (hash-based, sem reload de página)
   * ------------------------------------------------------------------ */
  function getModuleFromHash() {
    const hash = window.location.hash.replace('#', '').trim();
    const found = MODULE_REGISTRY.find((m) => m.id === hash && m.status === 'active');
    return found ? found.id : DEFAULT_MODULE;
  }

  function navigateTo(moduleId) {
    currentModuleId = moduleId;
    const content = Utils.qs('#content');
    const mod = MODULE_REGISTRY.find((m) => m.id === moduleId) || MODULE_REGISTRY[0];

    Utils.qs('#pageTitle').textContent = mod.label;
    const breadcrumb = Utils.qs('#breadcrumb');
    Utils.emptyNode(breadcrumb);
    breadcrumb.appendChild(Utils.el('span', { class: 'breadcrumb__item', text: 'Portal RH' }));
    breadcrumb.appendChild(Utils.el('span', { text: '/' }));
    breadcrumb.appendChild(Utils.el('span', { class: 'breadcrumb__item', text: mod.group }));

    Utils.emptyNode(content);
    const section = Utils.el('section', { class: 'view', 'data-view': mod.id });
    content.appendChild(section);

    if (mod.status === 'active' && typeof mod.render === 'function') {
      mod.render(section);
    } else {
      renderSoon(section, mod);
    }

    buildSidebar(mod.id);
    document.title = `${mod.label} · Portal de RH`;
  }

  /** Re-renderiza somente a view ativa (usado após a chegada de novos dados). */
  function rerenderCurrentModule() {
    if (!currentModuleId) return;
    navigateTo(currentModuleId);
  }

  window.addEventListener('hashchange', () => navigateTo(getModuleFromHash()));


  /* --------------------------------------------------------------------
   * 5. HELPERS DE MONTAGEM DE VIEW
   * ------------------------------------------------------------------ */

  function sectionHeader(title, desc) {
    return Utils.el('div', { class: 'view__section-header' }, [
      Utils.el('div', {}, [
        Utils.el('h2', { class: 'view__section-title', text: title }),
        desc ? Utils.el('p', { class: 'view__section-desc', text: desc }) : null,
      ]),
    ]);
  }

  function kpiCard({ icon, label, value, delta, deltaDirection, loading }) {
    const frag = Utils.cloneTemplate('tpl-kpi-card');
    Utils.qs('.kpi-card__icon', frag).appendChild(iconEl(icon, 18));
    Utils.qs('.kpi-card__label', frag).textContent = label;
    const valueEl = Utils.qs('.kpi-card__value', frag);
    valueEl.textContent = loading ? '···' : value;
    if (loading) valueEl.classList.add('is-loading', 'is-loading-pulse');
    const deltaEl = Utils.qs('.kpi-card__delta', frag);
    deltaEl.textContent = delta || '';
    if (deltaDirection) deltaEl.classList.add(`kpi-card__delta--${deltaDirection}`);
    return frag;
  }

  function kpiGrid(cards) {
    const grid = Utils.el('div', { class: 'kpi-grid' });
    cards.forEach((c) => grid.appendChild(kpiCard(c)));
    return grid;
  }

  function chartGrid(charts) {
    const grid = Utils.el('div', { class: 'chart-grid' });
    charts.forEach(({ title }) => Charts.renderPlaceholder(grid, { title }));
    return grid;
  }

  /** Banner amigável exibido quando uma base falhou ao carregar (com opção de tentar de novo). */
  function alertBanner({ title, message, variant = 'warning', onRetry }) {
    const banner = Utils.el('div', { class: `alert-banner alert-banner--${variant}` }, [
      Utils.el('span', { class: 'alert-banner__icon' }, [iconEl(variant === 'error' ? 'error' : 'warning', 20)]),
      Utils.el('div', { class: 'alert-banner__body' }, [
        Utils.el('p', { class: 'alert-banner__title', text: title }),
        Utils.el('p', { class: 'alert-banner__text', text: message }),
      ]),
    ]);
    if (onRetry) {
      const actions = Utils.el('div', { class: 'alert-banner__actions' });
      const btn = Utils.el('button', { class: 'btn btn--primary', type: 'button', text: 'Tentar novamente' });
      btn.addEventListener('click', onRetry);
      actions.appendChild(btn);
      banner.appendChild(actions);
    }
    return banner;
  }

  /**
   * Monta os botões "Excel" e "PDF" do cabeçalho de uma tabela. Reaproveita o
   * próprio `mapRow` (que já monta as células <td> exibidas na tela) como
   * fonte de verdade para a exportação — lendo o texto já formatado de cada
   * célula — em vez de duplicar a lógica de formatação de cada módulo aqui.
   */
  function exportActions({ title, columns, rows, mapRow, exportRows }) {
    function extractExportRows() {
      const source = exportRows || rows;
      return source.map((row, i) => mapRow(row, i).map((cell) => cell.textContent));
    }

    const excelBtn = Utils.el('button', { class: 'btn btn--sm', type: 'button', title: 'Exportar para Excel' }, [
      iconEl('documentos', 14), Utils.el('span', { text: 'Excel' }),
    ]);
    excelBtn.addEventListener('click', () => {
      Utils.exportToExcel({ filename: title, columns, rows: extractExportRows() });
      Utils.toast(`"${title}" exportado para Excel.`, 'success');
    });

    const pdfBtn = Utils.el('button', { class: 'btn btn--sm', type: 'button', title: 'Exportar para PDF' }, [
      iconEl('documentos', 14), Utils.el('span', { text: 'PDF' }),
    ]);
    pdfBtn.addEventListener('click', () => {
      Utils.exportToPDF({ title, columns, rows: extractExportRows() });
      Utils.toast(`Preparando "${title}" para PDF — use "Salvar como PDF" na janela de impressão.`, 'info');
    });

    return Utils.el('div', { class: 'table-card__actions' }, [excelBtn, pdfBtn]);
  }

  /**
   * Monta um card de tabela com dados reais (ou estado vazio/loading).
   * @param {{title: string, columns: string[], rows: Array<Object>, mapRow: Function, rowClass?: Function, onRowClick?: Function, loading?: boolean, maxRows?: number}} opts
   *   rowClass: opcional — função (row) => string de classe(s) CSS extra para o <tr>,
   *   usada hoje pelo Controle de Rescisões para destacar linhas vencidas/urgentes.
   *   onRowClick: opcional — função (row) => void, chamada ao clicar numa linha;
   *   usada hoje pelo módulo de Admissões para abrir o detalhe/linha do tempo do processo.
   *   exportRows: opcional — array alternativo de linhas usado apenas na exportação
   *   (Excel/PDF), em outra ordem/critério da exibida em tela. Se omitido, exporta
   *   na mesma ordem de `rows` (comportamento padrão, igual ao anterior).
   */
  function dataTableCard({ title, columns, rows, mapRow, rowClass, onRowClick, loading = false, maxRows = 300, exportRows }) {
    const card = Utils.el('div', { class: 'table-card' });
    const countLabel = loading ? '···' : `${Utils.formatNumber(rows.length)} registro${rows.length === 1 ? '' : 's'}`;

    const heading = Utils.el('div', { class: 'table-card__heading' }, [
      Utils.el('h3', { class: 'table-card__title', text: title }),
      Utils.el('span', { class: `table-card__count${loading ? ' is-loading is-loading-pulse' : ''}`, text: countLabel }),
    ]);

    card.appendChild(Utils.el('div', { class: 'table-card__header' }, [
      heading,
      (!loading && rows.length > 0) ? exportActions({ title, columns, rows, mapRow, exportRows }) : Utils.el('div'),
    ]));

    const scroll = Utils.el('div', { class: 'table-scroll' });
    const table = Utils.el('table', { class: 'data-table' });
    table.appendChild(Utils.el('thead', {}, [
      Utils.el('tr', {}, columns.map((col) => Utils.el('th', { text: col }))),
    ]));

    const tbody = Utils.el('tbody');

    if (loading) {
      tbody.appendChild(Utils.el('tr', { class: 'table-loading-row' }, [
        Utils.el('td', { colspan: String(columns.length) }, [
          Utils.el('div', { class: 'spinner' }),
          Utils.el('div', { text: 'Carregando dados da planilha…' }),
        ]),
      ]));
    } else if (rows.length > 0) {
      rows.slice(0, maxRows).forEach((row, i) => {
        let extraClass = rowClass ? rowClass(row) : '';
        if (onRowClick) extraClass = `${extraClass} row-clickable`.trim();
        const tr = Utils.el('tr', extraClass ? { class: extraClass } : {}, mapRow(row, i));
        if (onRowClick) tr.addEventListener('click', () => onRowClick(row));
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    scroll.appendChild(table);
    card.appendChild(scroll);

    if (!loading && rows.length === 0) {
      card.appendChild(Utils.cloneTemplate('tpl-empty-table'));
    } else if (!loading && rows.length > maxRows) {
      card.appendChild(Utils.el('p', {
        class: 'view__section-desc',
        text: `Exibindo os ${Utils.formatNumber(maxRows)} registros mais recentes de ${Utils.formatNumber(rows.length)}. Utilize os filtros para refinar.`,
      }));
    }

    return card;
  }

  function td(text) { return Utils.el('td', { text: text === null || text === undefined || text === '' ? '—' : String(text) }); }
  function tdTag(text, variant) { return Utils.el('td', {}, [Utils.el('span', { class: `tag tag--${variant}`, text: text || '—' })]); }

  function renderSoon(container, mod) {
    const frag = Utils.cloneTemplate('tpl-soon-view');
    Utils.qs('.soon-view__icon', frag).appendChild(iconEl(mod.icon, 26));
    Utils.qs('.soon-view__title', frag).textContent = mod.label;
    container.appendChild(frag);
  }

  /** Ordena por DATA desc (nulos por último) — usado nas tabelas de "mais recentes". */
  function sortByDateDesc(list) {
    return [...list].sort((a, b) => {
      const da = a.DATA ? a.DATA.getTime() : -Infinity;
      const db = b.DATA ? b.DATA.getTime() : -Infinity;
      return db - da;
    });
  }

  /** Ordena por DATA asc (nulos por último) — usado onde a data prevista mais próxima importa primeiro (ex: Admissões). */
  function sortByDateAsc(list) {
    return [...list].sort((a, b) => {
      const da = a.DATA ? a.DATA.getTime() : Infinity;
      const db = b.DATA ? b.DATA.getTime() : Infinity;
      return da - db;
    });
  }

  /**
   * Modal genérico (overlay + painel), sem dependência de nenhum módulo específico —
   * pode ser reaproveitado por qualquer view futura que precise de um detalhe/drawer.
   * Só uma instância fica aberta por vez; abrir um novo modal fecha o anterior.
   */
  let _activeModalKeyHandler = null;

  function closeModal() {
    const overlay = Utils.qs('#activeModalOverlay');
    if (overlay) overlay.remove();
    if (_activeModalKeyHandler) {
      document.removeEventListener('keydown', _activeModalKeyHandler);
      _activeModalKeyHandler = null;
    }
  }

  function openModal({ title, subtitle, bodyEl }) {
    closeModal();

    const closeBtn = Utils.el('button', { class: 'modal-panel__close', type: 'button', 'aria-label': 'Fechar' }, [iconEl('close', 16)]);
    closeBtn.addEventListener('click', closeModal);

    const panel = Utils.el('div', { class: 'modal-panel' }, [
      Utils.el('div', { class: 'modal-panel__header' }, [
        Utils.el('div', {}, [
          Utils.el('h3', { class: 'modal-panel__title', text: title }),
          subtitle ? Utils.el('p', { class: 'modal-panel__subtitle', text: subtitle }) : null,
        ]),
        closeBtn,
      ]),
      Utils.el('div', { class: 'modal-panel__body' }, [bodyEl]),
    ]);

    const overlay = Utils.el('div', { class: 'modal-overlay', id: 'activeModalOverlay' }, [panel]);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    _activeModalKeyHandler = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', _activeModalKeyHandler);

    document.body.appendChild(overlay);
  }

  function mesesPresentes(data, field = 'MES') {
    const found = Utils.uniqueValues(data, field);
    return MESES_ORDER.filter((m) => found.includes(m));
  }


  /* --------------------------------------------------------------------
   * 5b. HELPERS DO DASHBOARD EXECUTIVO
   * ------------------------------------------------------------------
   * Funções específicas para KPIs analíticos, gráficos reais (Chart.js) e
   * rankings do módulo "dashboard". Ficam isoladas aqui para não poluir os
   * helpers genéricos usados pelos demais módulos (que ainda usam apenas
   * placeholders de gráfico).
   * ------------------------------------------------------------------ */

  /** Retorna uma cópia da lista com um campo ANO (string) derivado de DATA — usado pelo filtro global "Ano". */
  function withAno(list) {
    return list.map((r) => ({ ...r, ANO: r.DATA ? String(r.DATA.getFullYear()) : null }));
  }

  /**
   * Agrupa admissões + desligamentos por um campo (LOJA, SUPERVISOR, GERENTE ou FUNCAO),
   * contando quantas admissões e desligamentos cada valor teve, e já calcula o saldo.
   * Retorna ordenado do maior para o menor número de desligamentos — usado tanto nos
   * gráficos de barra quanto nos cards de ranking.
   */
  function groupMovStats(admissoesList, desligamentosList, key) {
    const map = new Map();
    const bump = (item, field) => {
      const k = item[key];
      if (!k) return;
      if (!map.has(k)) map.set(k, { key: k, admissoes: 0, desligamentos: 0 });
      map.get(k)[field] += 1;
    };
    desligamentosList.forEach((r) => bump(r, 'desligamentos'));
    admissoesList.forEach((r) => bump(r, 'admissoes'));

    return Array.from(map.values())
      .map((item) => ({ ...item, saldo: item.admissoes - item.desligamentos }))
      .sort((a, b) => b.desligamentos - a.desligamentos);
  }

  /**
   * Estima o tempo médio (em dias) entre admissão e desligamento, casando cada
   * desligamento com a admissão mais recente do mesmo colaborador que aconteceu
   * antes (ou na mesma data) do desligamento. Colaboradores sem admissão
   * correspondente no conjunto filtrado são ignorados (melhor esforço, sem base
   * de matrícula única disponível na planilha de origem).
   */
  function computeAvgTenureDays(admissoesList, desligamentosList) {
    const admByColaborador = new Map();
    admissoesList.forEach((r) => {
      if (!r.COLABORADOR || !r.DATA) return;
      if (!admByColaborador.has(r.COLABORADOR)) admByColaborador.set(r.COLABORADOR, []);
      admByColaborador.get(r.COLABORADOR).push(r.DATA);
    });
    admByColaborador.forEach((datas) => datas.sort((a, b) => a - b));

    const diasEntre = [];
    desligamentosList.forEach((d) => {
      if (!d.COLABORADOR || !d.DATA) return;
      const datasAdmissao = admByColaborador.get(d.COLABORADOR);
      if (!datasAdmissao || !datasAdmissao.length) return;

      let candidata = null;
      for (let i = datasAdmissao.length - 1; i >= 0; i--) {
        if (datasAdmissao[i] <= d.DATA) { candidata = datasAdmissao[i]; break; }
      }
      if (!candidata) candidata = datasAdmissao[0];

      const dias = (d.DATA - candidata) / (1000 * 60 * 60 * 24);
      if (dias >= 0) diasEntre.push(dias);
    });

    if (!diasEntre.length) return null;
    return diasEntre.reduce((sum, v) => sum + v, 0) / diasEntre.length;
  }

  /**
   * Monta um card de gráfico real (apenas o HTML/canvas, sem instanciar o Chart.js ainda).
   * @param {{title: string, type: 'bar'|'line'|'donut', data: Object, options?: Object}} spec
   */
  function buildChartCard({ title }) {
    const canvasId = Utils.uid('chart');
    const card = Utils.el('div', { class: 'chart-card' }, [
      Utils.el('div', { class: 'chart-card__header' }, [
        Utils.el('h3', { class: 'chart-card__title', text: title }),
      ]),
      Utils.el('div', { class: 'chart-card__body' }, [
        Utils.el('div', { class: 'chart-card__canvas-wrap' }, [
          Utils.el('canvas', { id: canvasId }),
        ]),
      ]),
    ]);
    return { card, canvasId };
  }

  /**
   * Monta o grid de gráficos reais do Dashboard Executivo. Importante: o Chart.js
   * só é instanciado depois que o grid já está anexado ao DOM (via requestAnimationFrame),
   * porque ele precisa medir o tamanho real do container — se instanciado antes de
   * anexar, o canvas fica com o tamanho padrão do navegador (300x150) e nada é desenhado.
   */
  function realChartGrid(specs) {
    const grid = Utils.el('div', { class: 'chart-grid' });
    const pending = specs.map((spec) => {
      const { card, canvasId } = buildChartCard(spec);
      grid.appendChild(card);
      return { canvasId, spec };
    });

    requestAnimationFrame(() => {
      pending.forEach(({ canvasId, spec }) => {
        const { type, data, options = {} } = spec;
        if (type === 'line') Charts.renderLineChart(canvasId, data, options);
        else if (type === 'donut') Charts.renderDonutChart(canvasId, data, options);
        else Charts.renderBarChart(canvasId, data, options);
      });
    });

    return grid;
  }

  /** Monta um card de ranking (lista ordenada com barra proporcional) a partir do resultado de groupMovStats. */
  function rankingCard({ title, items, emptyText = 'Nenhum dado no período selecionado.' }) {
    const card = Utils.el('div', { class: 'ranking-card' });
    card.appendChild(Utils.el('div', { class: 'ranking-card__header' }, [
      Utils.el('h3', { class: 'ranking-card__title', text: title }),
    ]));

    const list = Utils.el('div', { class: 'ranking-list' });
    if (!items.length) {
      list.appendChild(Utils.el('p', { class: 'ranking-empty', text: emptyText }));
    } else {
      const max = Math.max(...items.map((i) => i.desligamentos), 1);
      items.forEach((item, idx) => {
        const pct = Math.max(4, Math.round((item.desligamentos / max) * 100));
        const saldoText = item.saldo > 0 ? `+${item.saldo}` : String(item.saldo);
        list.appendChild(Utils.el('div', { class: 'ranking-item' }, [
          Utils.el('span', { class: `ranking-item__pos${idx < 3 ? ' ranking-item__pos--top' : ''}`, text: String(idx + 1) }),
          Utils.el('div', { class: 'ranking-item__body' }, [
            Utils.el('div', { class: 'ranking-item__top' }, [
              Utils.el('span', { class: 'ranking-item__name', text: item.key }),
              Utils.el('span', { class: 'ranking-item__count', text: `${Utils.formatNumber(item.desligamentos)} desligamento${item.desligamentos === 1 ? '' : 's'}` }),
            ]),
            Utils.el('div', { class: 'ranking-item__bar' }, [
              Utils.el('div', { class: 'ranking-item__bar-fill', style: `width:${pct}%` }),
            ]),
            Utils.el('div', { class: 'ranking-item__meta' }, [
              Utils.el('span', { text: `Admissões: ${Utils.formatNumber(item.admissoes)}` }),
              Utils.el('span', { text: `Saldo: ${saldoText}` }),
            ]),
          ]),
        ]));
      });
    }
    card.appendChild(list);
    return card;
  }

  function rankingGrid(cards) {
    return Utils.el('div', { class: 'ranking-grid' }, cards);
  }


  /* --------------------------------------------------------------------
   * 5c. HELPERS DO MÓDULO DE CONTROLE DE RESCISÕES
   * ------------------------------------------------------------------
   * O Controle de Rescisões NÃO possui planilha própria: ele reaproveita a
   * base de Desligamentos (que já contém TIPO_AVISO, DATA, COLABORADOR,
   * LOJA, GERENTE, SUPERVISOR e FUNCAO) para calcular o prazo legal de
   * pagamento da rescisão a partir da data do desligamento. Isolado aqui
   * para não misturar essa regra de negócio com os helpers genéricos.
   * ------------------------------------------------------------------ */

  // Prazo em dias corridos, contados a partir da DATA do desligamento, por TIPO_AVISO:
  //   TRABALHADO        -> 30 dias de aviso prévio + 9 dias após a projeção = 39 dias.
  //   INDENIZADO        -> 9 dias corridos.
  //   DISPENSA DE AVISO -> 9 dias corridos.
  const PRAZO_RESCISAO_DIAS = {
    TRABALHADO: 39,
    INDENIZADO: 9,
    DISPENSA_AVISO: 9,
  };

  /** Identifica o prazo (dias) a partir do texto livre de TIPO_AVISO — tolerante a acentos/caixa. */
  function prazoDiasPorTipoAviso(tipoAvisoRaw) {
    const t = Utils.normalize(tipoAvisoRaw);
    if (!t) return null;
    if (t.includes('trabalhado')) return PRAZO_RESCISAO_DIAS.TRABALHADO;
    if (t.includes('indenizado')) return PRAZO_RESCISAO_DIAS.INDENIZADO;
    if (t.includes('dispensa')) return PRAZO_RESCISAO_DIAS.DISPENSA_AVISO;
    return null; // TIPO_AVISO vazio ou com valor não reconhecido
  }

  /** Soma dias corridos a uma data, sempre retornando meia-noite local (evita drift de fuso/horário). */
  function addDiasCorridos(date, dias) {
    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    base.setDate(base.getDate() + dias);
    return base;
  }

  /** Meia-noite de hoje (local) — referência estável para o cálculo de "dias restantes". */
  function hojeMeiaNoite() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * Classifica o nível de risco de atraso a partir dos dias restantes até o prazo final.
   * Níveis, do mais tranquilo ao mais crítico: OK (verde) > ATENCAO (amarelo) >
   * URGENTE (laranja) > VENCIDO (vermelho). Limiares definidos para alimentar tanto o
   * badge de status quanto os cards de resumo do módulo.
   */
  function classificarPrazoRescisao(diasRestantes) {
    if (diasRestantes === null) return { nivel: 'SEM_PRAZO', label: 'Sem tipo de aviso', variant: 'neutral' };
    if (diasRestantes < 0) return { nivel: 'VENCIDO', label: 'Vencido', variant: 'danger' };
    if (diasRestantes <= 5) return { nivel: 'URGENTE', label: 'Urgente', variant: 'urgent' };
    if (diasRestantes <= 15) return { nivel: 'ATENCAO', label: 'Atenção', variant: 'warning' };
    return { nivel: 'OK', label: 'Prazo OK', variant: 'success' };
  }

  /**
   * A partir da base de Desligamentos, calcula para cada registro: o prazo em dias
   * (conforme TIPO_AVISO), a Data Limite (Data Inicial + prazo) e os Dias Restantes
   * até essa data, já classificados em um nível de risco.
   * Registros com STATUS "Finalizado" já foram pagos/encerrados — não entram mais
   * na sinalização de vencido/urgente, mesmo que a data limite já tenha passado.
   */
  function buildRescisoes(desligamentosList) {
    const hoje = hojeMeiaNoite();
    return desligamentosList.map((r) => {
      const prazoDias = prazoDiasPorTipoAviso(r.TIPO_AVISO);
      const dataInicial = r.DATA || null;
      const dataLimite = (dataInicial && prazoDias !== null) ? addDiasCorridos(dataInicial, prazoDias) : null;
      const diasRestantes = dataLimite ? Math.round((dataLimite - hoje) / (1000 * 60 * 60 * 24)) : null;
      const finalizado = (r.STATUS || '').toUpperCase().includes('FINALIZADO');
      const status = finalizado
        ? { nivel: 'FINALIZADO', label: 'Pago e encerrado', variant: 'success' }
        : classificarPrazoRescisao(diasRestantes);
      return {
        ...r,
        PRAZO_DIAS: prazoDias,
        DATA_LIMITE: dataLimite,
        DIAS_RESTANTES: diasRestantes,
        STATUS_RESCISAO: status,
        STATUS_LABEL: status.label,
      };
    });
  }

  /** Ordena do mais urgente para o mais tranquilo (vencidos primeiro); sem prazo definido vai ao final. */
  function sortByUrgencia(list) {
    return [...list].sort((a, b) => {
      if (a.DIAS_RESTANTES === null && b.DIAS_RESTANTES === null) return 0;
      if (a.DIAS_RESTANTES === null) return 1;
      if (b.DIAS_RESTANTES === null) return -1;
      return a.DIAS_RESTANTES - b.DIAS_RESTANTES;
    });
  }

  /** Card de resumo (contagem) para os níveis de risco do Controle de Rescisões. */
  function rescisaoSummaryCard({ label, value, variant, icon, loading }) {
    return Utils.el('article', { class: `rescisao-summary-card rescisao-summary-card--${variant}` }, [
      Utils.el('div', { class: 'rescisao-summary-card__icon' }, [iconEl(icon, 20)]),
      Utils.el('div', { class: 'rescisao-summary-card__body' }, [
        Utils.el('strong', { class: `rescisao-summary-card__value${loading ? ' is-loading is-loading-pulse' : ''}`, text: loading ? '···' : String(value) }),
        Utils.el('span', { class: 'rescisao-summary-card__label', text: label }),
      ]),
    ]);
  }

  function rescisaoSummaryGrid(cards) {
    const grid = Utils.el('div', { class: 'rescisao-summary-grid' });
    cards.forEach((c) => grid.appendChild(rescisaoSummaryCard(c)));
    return grid;
  }


  /* --------------------------------------------------------------------
   * 5d. HELPERS DO MÓDULO DE ADMISSÕES
   * ------------------------------------------------------------------
   * O painel de acompanhamento de Admissões classifica o texto livre da
   * coluna STATUS (BASE_ADMISSOES) em 5 estágios de processo conhecidos,
   * cada um com sua própria cor semântica, usados tanto nos cards clicáveis
   * de resumo quanto na tag da tabela e na linha do tempo do processo.
   * Isolado aqui pelo mesmo motivo do bloco "5c" (Rescisões): mantém essa
   * regra de negócio fora dos helpers genéricos usados por outros módulos.
   * ------------------------------------------------------------------ */

  // Os 5 estágios progressivos do processo de admissão, nesta ordem — usados
  // tanto na classificação de STATUS quanto na renderização da linha do tempo.
  // "Cancelar" não é um estágio de progresso; é um estado terminal à parte (ADMISSAO_STATUS_CANCELADO).
  const ADMISSAO_STATUS_STAGES = [
    { id: 'AGUARDANDO_DOC', label: 'Aguardando documentação', variant: 'neutral', icon: 'documentos' },
    { id: 'EXAME_PENDENTE', label: 'Exame pendente', variant: 'warning', icon: 'auditorias' },
    { id: 'CADASTRO_PENDENTE', label: 'Cadastro pendente', variant: 'urgent', icon: 'admissoes' },
    { id: 'INICIO_PROGRAMADO', label: 'Início programado', variant: 'info', icon: 'ferias' },
    { id: 'CONCLUIDA', label: 'Admissões concluídas', variant: 'success', icon: 'admissoes' },
  ];
  const ADMISSAO_STATUS_CANCELADO = { id: 'CANCELADO', label: 'Cancelar', variant: 'danger', icon: 'desligamentos' };
  const ADMISSAO_STATUS_INDEFINIDO = { id: 'INDEFINIDO', label: 'Status não informado', variant: 'neutral', icon: 'warning' };

  /**
   * Classifica o texto livre da coluna STATUS em um dos 6 estágios conhecidos —
   * tolerante a acentos/caixa (via Utils.normalize), no mesmo espírito de
   * prazoDiasPorTipoAviso (5c). "FINALIZADO" (valor legado usado antes deste
   * painel) continua sendo reconhecido como "Admissões concluídas".
   */
  function classificarStatusAdmissao(rawStatus) {
    const t = Utils.normalize(rawStatus);
    if (!t) return ADMISSAO_STATUS_INDEFINIDO;
    if (t.includes('cancel')) return ADMISSAO_STATUS_CANCELADO;
    if (t.includes('conclu') || t.includes('finaliz')) return ADMISSAO_STATUS_STAGES[4];
    if (t.includes('inicio') && t.includes('programad')) return ADMISSAO_STATUS_STAGES[3];
    if (t.includes('cadastro')) return ADMISSAO_STATUS_STAGES[2];
    if (t.includes('exame')) return ADMISSAO_STATUS_STAGES[1];
    if (t.includes('document')) return ADMISSAO_STATUS_STAGES[0];
    return ADMISSAO_STATUS_INDEFINIDO;
  }

  /** Enriquece a base de admissões com o status classificado (STATUS_INFO / STATUS_LABEL). */
  function buildAdmissoesProcessadas(admissoesList) {
    return admissoesList.map((r) => {
      const info = classificarStatusAdmissao(r.STATUS);
      return { ...r, STATUS_INFO: info, STATUS_LABEL: info.label };
    });
  }

  /** Card de resumo clicável (contagem por estágio do processo) — clicar filtra a tabela por esse status. */
  function admissaoStatusCard({ label, value, variant, icon, active, loading, onClick }) {
    const classes = [`status-card`, `status-card--${variant}`];
    if (active) classes.push('status-card--active');
    const card = Utils.el('button', { class: classes.join(' '), type: 'button' }, [
      Utils.el('div', { class: 'status-card__icon' }, [iconEl(icon, 20)]),
      Utils.el('div', { class: 'status-card__body' }, [
        Utils.el('strong', { class: `status-card__value${loading ? ' is-loading is-loading-pulse' : ''}`, text: loading ? '···' : String(value) }),
        Utils.el('span', { class: 'status-card__label', text: label }),
      ]),
    ]);
    card.addEventListener('click', onClick);
    return card;
  }

  function admissaoStatusGrid(cards) {
    const grid = Utils.el('div', { class: 'status-card-grid' });
    cards.forEach((c) => grid.appendChild(admissaoStatusCard(c)));
    return grid;
  }

  /**
   * Monta a linha do tempo visual do processo de admissão (stepper horizontal
   * com os 4 estágios). Se o processo foi cancelado, exibe os mesmos 4 estágios
   * em estado neutro/apagado com um aviso de cancelamento no topo — a planilha
   * não registra em qual estágio o cancelamento ocorreu.
   */
  function buildProcessTimeline(statusInfo) {
    const cancelado = statusInfo.id === 'CANCELADO';
    const stageIndex = ADMISSAO_STATUS_STAGES.findIndex((s) => s.id === statusInfo.id);

    const wrap = Utils.el('div', { class: `process-timeline${cancelado ? ' process-timeline--cancelled' : ''}` });

    if (cancelado) {
      wrap.appendChild(Utils.el('div', { class: 'process-timeline__cancelled-banner' }, [
        iconEl('close', 16),
        Utils.el('span', { text: 'Processo cancelado' }),
      ]));
    }

    const track = Utils.el('div', { class: 'process-timeline__track' });
    ADMISSAO_STATUS_STAGES.forEach((stage, idx) => {
      let stepState = 'pending';
      if (!cancelado && stageIndex >= 0) {
        if (idx < stageIndex) stepState = 'done';
        else if (idx === stageIndex) stepState = 'current';
      }

      if (idx > 0) {
        track.appendChild(Utils.el('div', { class: `process-timeline__connector process-timeline__connector--${stepState === 'pending' ? 'pending' : 'done'}` }));
      }

      track.appendChild(Utils.el('div', { class: `process-timeline__step process-timeline__step--${cancelado ? 'cancelled' : stepState}` }, [
        Utils.el('span', { class: 'process-timeline__dot' }),
        Utils.el('span', { class: 'process-timeline__label', text: stage.label }),
      ]));
    });
    wrap.appendChild(track);

    return wrap;
  }

  /** Abre o modal de detalhe de um processo de admissão: dados do colaborador + linha do tempo. */
  function openAdmissaoDetail(record) {
    const info = Utils.el('div', { class: 'modal-info-grid' }, [
      Utils.el('div', { class: 'modal-info-item' }, [Utils.el('span', { class: 'modal-info-item__label', text: 'Supervisor' }), Utils.el('span', { class: 'modal-info-item__value', text: record.SUPERVISOR || '—' })]),
      Utils.el('div', { class: 'modal-info-item' }, [Utils.el('span', { class: 'modal-info-item__label', text: 'Gerente' }), Utils.el('span', { class: 'modal-info-item__value', text: record.GERENTE || '—' })]),
      Utils.el('div', { class: 'modal-info-item' }, [Utils.el('span', { class: 'modal-info-item__label', text: 'Função' }), Utils.el('span', { class: 'modal-info-item__value', text: record.FUNCAO || '—' })]),
      Utils.el('div', { class: 'modal-info-item' }, [Utils.el('span', { class: 'modal-info-item__label', text: 'Data prevista' }), Utils.el('span', { class: 'modal-info-item__value', text: Utils.formatDate(record.DATA) })]),
      Utils.el('div', { class: 'modal-info-item' }, [
        Utils.el('span', { class: 'modal-info-item__label', text: 'Status' }),
        Utils.el('span', { class: 'modal-info-item__value' }, [Utils.el('span', { class: `tag tag--${record.STATUS_INFO.variant}`, text: record.STATUS_LABEL })]),
      ]),
    ]);

    const body = Utils.el('div', {}, [
      info,
      Utils.el('h4', { class: 'modal-section-title', text: 'Linha do tempo do processo' }),
      buildProcessTimeline(record.STATUS_INFO),
    ]);

    openModal({
      title: record.COLABORADOR || 'Processo de admissão',
      subtitle: record.LOJA || '',
      bodyEl: body,
    });
  }


  /* --------------------------------------------------------------------
   * 5e. HELPERS DO MÓDULO DE TURNOVER
   * ------------------------------------------------------------------
   * Turnover não tem aba própria na planilha — é calculado em cima das
   * mesmas bases já usadas por Admissões/Desligamentos/Dashboard
   * (DATASETS.admissoes, DATASETS.desligamentos, DATASETS.lojas).
   *
   * Metodologia (definida com o usuário em 10/08/2026, após validação dos
   * dados reais da planilha):
   *
   *   Turnover(%) = ((Admissões finalizadas + Desligamentos) / 2) / Headcount médio × 100
   *
   * O Headcount histórico é reconstruído a partir do Headcount ATUAL da
   * BASE_LOJA (única fonte de headcount — sem coluna de data própria),
   * retrocedendo mês a mês pelos eventos REAIS de admissão/desligamento
   * registrados DEPOIS do fim de cada mês. Como a reconstrução só compara
   * contra datas de eventos já registrados na planilha (nunca contra "hoje"),
   * não é preciso presumir nenhuma data de referência fixa.
   *
   * Só contam como admissão "de fato" os registros com STATUS = FINALIZADO —
   * "EXAME MÉDICO" e "INICIO PROGRAMADO" são estágios do funil em que a
   * pessoa ainda não entrou no quadro (mesmo campo usado no painel de
   * Admissões, ver ADMISSAO_STATUS_STAGES em 5d).
   *
   * Limitações confirmadas nos dados reais e respeitadas aqui:
   *   - Não existe Headcount por Função na planilha → Turnover por Função é
   *     exibido como CONTAGEM de admissões/desligamentos, nunca como taxa.
   *   - 2 das 32 lojas não tiveram nenhum evento no período → o
   *     gerente/supervisor delas é desconhecido e ficam de fora dos
   *     agrupamentos por Gerente/Supervisor (buildLojaResponsavelMap só
   *     mapeia uma loja quando ela tem exatamente 1 gerente e 1 supervisor
   *     em todos os eventos vistos — nunca presume).
   *   - Com o filtro "Função" ativo, a taxa de Turnover (baseada em
   *     Headcount por loja) não pode ser calculada com segurança → os KPIs/
   *     gráficos de taxa mostram "—" nesse caso; só as contagens continuam.
   * ------------------------------------------------------------------ */

  /** Só as admissões que representam entrada efetiva no quadro (ver nota acima). */
  function admissoesFinalizadas(admissoesList) {
    return admissoesList.filter((r) => (r.STATUS || '').toUpperCase() === 'FINALIZADO');
  }

  /**
   * Mapa LOJA -> { gerente, supervisor }, construído a partir dos eventos reais
   * (admissões finalizadas + desligamentos). Só inclui uma loja quando existe
   * EXATAMENTE um gerente e um supervisor associado a ela em todos os eventos
   * vistos (validado nos dados reais em 10/08/2026: nenhuma loja teve mais de
   * um responsável). Se isso deixar de ser verdade no futuro, a loja
   * simplesmente fica fora do mapa em vez de usar um valor presumido.
   */
  function buildLojaResponsavelMap(admFinalList, desligamentosList) {
    const porLoja = new Map();
    [...admFinalList, ...desligamentosList].forEach((r) => {
      if (!r.LOJA) return;
      if (!porLoja.has(r.LOJA)) porLoja.set(r.LOJA, { gerentes: new Set(), supervisores: new Set() });
      if (r.GERENTE) porLoja.get(r.LOJA).gerentes.add(r.GERENTE);
      if (r.SUPERVISOR) porLoja.get(r.LOJA).supervisores.add(r.SUPERVISOR);
    });

    const map = {};
    porLoja.forEach((v, loja) => {
      if (v.gerentes.size === 1 && v.supervisores.size === 1) {
        map[loja] = { gerente: [...v.gerentes][0], supervisor: [...v.supervisores][0] };
      }
      // Loja com 0 ou 2+ responsáveis distintos fica de fora do mapa de propósito.
    });
    return map;
  }

  /**
   * Reconstrói a série mensal de Headcount (inicial/final/médio) e Turnover a
   * partir do Headcount ATUAL de um grupo (já filtrado por loja/gerente/
   * supervisor, se for o caso) e dos eventos reais desse mesmo grupo. Um mês
   * só aparece na série se houve pelo menos 1 admissão finalizada OU 1
   * desligamento (do grupo) durante ele.
   */
  function reconstructMonthlySeries(admFinalList, deslList, headcountAtual) {
    const eventos = [...admFinalList, ...deslList].filter((r) => r.DATA);
    if (!eventos.length) return [];

    const periodKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const periodsMap = new Map();
    eventos.forEach((r) => {
      const key = periodKey(r.DATA);
      if (!periodsMap.has(key)) {
        periodsMap.set(key, { key, ano: r.DATA.getFullYear(), mesNum: r.DATA.getMonth() + 1, mes: r.MES });
      }
    });

    return Array.from(periodsMap.values())
      .sort((a, b) => (a.ano - b.ano) || (a.mesNum - b.mesNum))
      .map((p) => {
        const fimMes = new Date(p.ano, p.mesNum, 0, 23, 59, 59, 999);
        const inicioMes = new Date(p.ano, p.mesNum - 1, 1);

        const admApos = admFinalList.filter((r) => r.DATA && r.DATA > fimMes).length;
        const deslApos = deslList.filter((r) => r.DATA && r.DATA > fimMes).length;
        const headcountFinal = headcountAtual - admApos + deslApos;

        const admNoMes = admFinalList.filter((r) => r.DATA && r.DATA >= inicioMes && r.DATA <= fimMes).length;
        const deslNoMes = deslList.filter((r) => r.DATA && r.DATA >= inicioMes && r.DATA <= fimMes).length;
        const headcountInicial = headcountFinal - admNoMes + deslNoMes;
        const headcountMedio = (headcountInicial + headcountFinal) / 2;

        const turnoverPct = headcountMedio > 0 ? (((admNoMes + deslNoMes) / 2) / headcountMedio) * 100 : null;

        return { ...p, admissoes: admNoMes, desligamentos: deslNoMes, headcountInicial, headcountFinal, headcountMedio, turnoverPct };
      });
  }

  /**
   * Turnover consolidado de um grupo, a partir da série mensal de
   * reconstructMonthlySeries. `periodFilter` opcional ({MES, ANO}) recorta o
   * período considerado DEPOIS de reconstruir a série completa (a
   * reconstrução precisa do histórico inteiro pra retroceder corretamente).
   * Se o grupo nunca teve nenhuma movimentação, o Turnover é 0% de forma
   * legítima (headcount não mudou) — não é tratado como "sem dado". Se o
   * grupo teve movimentação em OUTROS meses mas não no período filtrado,
   * o resultado do período filtrado é 0 admissões/desligamentos (real),
   * mas o Headcount médio do período específico não é calculável sem
   * reconstrução adicional, então fica "—" (não inventa).
   */
  function aggregateGroupTurnover(admFinalList, deslList, headcountAtual, periodFilter) {
    const series = reconstructMonthlySeries(admFinalList, deslList, headcountAtual);

    if (!series.length) {
      return {
        headcountAtual, admissoes: 0, desligamentos: 0,
        headcountMedioPeriodo: headcountAtual, turnoverPct: headcountAtual > 0 ? 0 : null,
        series,
      };
    }

    const seriesConsiderada = periodFilter
      ? series.filter((m) => (!periodFilter.MES || m.mes === periodFilter.MES) && (!periodFilter.ANO || String(m.ano) === periodFilter.ANO))
      : series;

    if (periodFilter && !seriesConsiderada.length) {
      return { headcountAtual, admissoes: 0, desligamentos: 0, headcountMedioPeriodo: null, turnoverPct: null, series: [] };
    }

    const totalAdm = seriesConsiderada.reduce((s, m) => s + m.admissoes, 0);
    const totalDesl = seriesConsiderada.reduce((s, m) => s + m.desligamentos, 0);
    const headcountMedioPeriodo = seriesConsiderada.reduce((s, m) => s + m.headcountMedio, 0) / seriesConsiderada.length;
    const turnoverPct = headcountMedioPeriodo > 0 ? (((totalAdm + totalDesl) / 2) / headcountMedioPeriodo) * 100 : null;

    return { headcountAtual, admissoes: totalAdm, desligamentos: totalDesl, headcountMedioPeriodo, turnoverPct, series: seriesConsiderada };
  }

  /**
   * Soma o Headcount que atende aos filtros ativos de LOJA/GERENTE/SUPERVISOR/
   * FUNCAO, usando a ABA_LOJA_FUNCAO (fonte de verdade oficial para Headcount
   * por loja e por função — decisão do usuário em 11/08/2026, prevalece sobre
   * BASE_LOJA quando os dois divergirem).
   * GERENTE/SUPERVISOR não existem na ABA_LOJA_FUNCAO (só LOJA/FUNCAO/
   * HEADCOUNT), então esses dois filtros traduzem primeiro para um conjunto de
   * lojas via lojaResponsavelMap (construído a partir dos eventos reais) — a
   * mesma limitação de sempre continua valendo: uma loja sem nenhum evento no
   * período não tem gerente/supervisor confirmado e fica de fora desses dois
   * filtros (mas continua contando normalmente no total geral e por Loja/Função).
   * Diferente da versão anterior, SEMPRE retorna um número (nunca null): a
   * ABA_LOJA_FUNCAO cobre também Função diretamente, então não existe mais um
   * recorte "impossível de calcular" por falta de Headcount.
   */
  function headcountFromLojaFuncao(matchFilters, lojaResponsavelMap, lojaFuncaoData) {
    let lojasElegiveis = null; // null = nenhum filtro de loja/gerente/supervisor ativo -> todas as lojas
    if (matchFilters.LOJA) {
      lojasElegiveis = new Set([matchFilters.LOJA]);
    }
    if (matchFilters.GERENTE) {
      const doGerente = new Set(Object.keys(lojaResponsavelMap).filter((l) => lojaResponsavelMap[l].gerente === matchFilters.GERENTE));
      lojasElegiveis = lojasElegiveis ? new Set([...lojasElegiveis].filter((l) => doGerente.has(l))) : doGerente;
    }
    if (matchFilters.SUPERVISOR) {
      const doSupervisor = new Set(Object.keys(lojaResponsavelMap).filter((l) => lojaResponsavelMap[l].supervisor === matchFilters.SUPERVISOR));
      lojasElegiveis = lojasElegiveis ? new Set([...lojasElegiveis].filter((l) => doSupervisor.has(l))) : doSupervisor;
    }

    return lojaFuncaoData
      .filter((r) => (lojasElegiveis === null || lojasElegiveis.has(r.LOJA)) && (!matchFilters.FUNCAO || r.FUNCAO === matchFilters.FUNCAO))
      .reduce((sum, r) => sum + (r.HEADCOUNT || 0), 0);
  }

  /** Soma o HEADCOUNT da ABA_LOJA_FUNCAO agrupado por um campo (LOJA ou FUNCAO) — base para os denominadores de Turnover por loja/função. */
  function sumHeadcountLojaFuncaoBy(lojaFuncaoData, key) {
    const map = {};
    lojaFuncaoData.forEach((r) => {
      if (!r[key]) return;
      map[r[key]] = (map[r[key]] || 0) + (r.HEADCOUNT || 0);
    });
    return map;
  }

  /** Turnover agrupado por um campo (LOJA, GERENTE ou SUPERVISOR) — cada item já com Headcount + taxa, ordenado da maior pra menor taxa. */
  function groupTurnoverStats(admFinalList, deslList, key, headcountByKey, periodFilter) {
    return Object.keys(headcountByKey)
      .map((k) => {
        const admFiltradas = admFinalList.filter((r) => r[key] === k);
        const deslFiltrados = deslList.filter((r) => r[key] === k);
        const agg = aggregateGroupTurnover(admFiltradas, deslFiltrados, headcountByKey[k], periodFilter);
        return { key: k, ...agg };
      })
      .sort((a, b) => {
        if (a.turnoverPct === null && b.turnoverPct === null) return 0;
        if (a.turnoverPct === null) return 1;
        if (b.turnoverPct === null) return -1;
        return b.turnoverPct - a.turnoverPct;
      });
  }

  /** Card de ranking por taxa de Turnover (%) — irmão de rankingCard (5), mas ordenado/dimensionado pela taxa, não por contagem. */
  function turnoverRankingCard({ title, items, emptyText = 'Nenhum dado no período selecionado.' }) {
    const card = Utils.el('div', { class: 'ranking-card' });
    card.appendChild(Utils.el('div', { class: 'ranking-card__header' }, [
      Utils.el('h3', { class: 'ranking-card__title', text: title }),
    ]));

    const comTaxa = items.filter((i) => i.turnoverPct !== null);
    const list = Utils.el('div', { class: 'ranking-list' });
    if (!comTaxa.length) {
      list.appendChild(Utils.el('p', { class: 'ranking-empty', text: emptyText }));
    } else {
      const max = Math.max(...comTaxa.map((i) => i.turnoverPct), 0.1);
      comTaxa.slice(0, 8).forEach((item, idx) => {
        const pct = Math.max(4, Math.round((item.turnoverPct / max) * 100));
        list.appendChild(Utils.el('div', { class: 'ranking-item' }, [
          Utils.el('span', { class: `ranking-item__pos${idx < 3 ? ' ranking-item__pos--top' : ''}`, text: String(idx + 1) }),
          Utils.el('div', { class: 'ranking-item__body' }, [
            Utils.el('div', { class: 'ranking-item__top' }, [
              Utils.el('span', { class: 'ranking-item__name', text: item.key }),
              Utils.el('span', { class: 'ranking-item__count', text: Utils.formatPercent(item.turnoverPct) }),
            ]),
            Utils.el('div', { class: 'ranking-item__bar' }, [
              Utils.el('div', { class: 'ranking-item__bar-fill', style: `width:${pct}%` }),
            ]),
            Utils.el('div', { class: 'ranking-item__meta' }, [
              Utils.el('span', { text: `Admissões: ${Utils.formatNumber(item.admissoes)}` }),
              Utils.el('span', { text: `Desligamentos: ${Utils.formatNumber(item.desligamentos)}` }),
              Utils.el('span', { text: `Headcount: ${Utils.formatNumber(item.headcountAtual)}` }),
            ]),
          ]),
        ]));
      });
    }
    card.appendChild(list);
    return card;
  }


  /* --------------------------------------------------------------------
   * 6. RENDERIZAÇÃO DE CADA MÓDULO
   * ------------------------------------------------------------------ */

  function renderDashboard(container) {
    const admissoesRes = DATASETS.admissoes;
    const desligamentosRes = DATASETS.desligamentos;
    const lojasRes = DATASETS.lojas;
    const rescisoesRes = DATASETS.rescisoes;
    const loading = !hasLoadedOnce;

    if (!loading) {
      if (!admissoesRes.ok) container.appendChild(errorBannerFor('admissoes', admissoesRes));
      if (!desligamentosRes.ok) container.appendChild(errorBannerFor('desligamentos', desligamentosRes));
      if (!lojasRes.ok) container.appendChild(errorBannerFor('lojas', lojasRes));
    }

    // Enriquece as duas bases com o campo ANO (derivado de DATA) para alimentar o filtro global "Ano".
    const admissoesAno = withAno(admissoesRes.data);
    const desligamentosAno = withAno(desligamentosRes.data);
    const combinedForOptions = [...admissoesAno, ...desligamentosAno];

    const filterWrap = Utils.el('div');
    const kpiWrap = Utils.el('div');
    const chartsWrapMovimentacao = Utils.el('div');
    const chartsWrapDistribuicao = Utils.el('div');
    const rankingWrap = Utils.el('div');

    container.appendChild(filterWrap);
    container.appendChild(sectionHeader('Visão geral da rede', 'Indicadores consolidados de todas as lojas, considerando os filtros aplicados'));
    container.appendChild(kpiWrap);
    container.appendChild(sectionHeader('Movimentação ao longo do tempo'));
    container.appendChild(chartsWrapMovimentacao);
    container.appendChild(sectionHeader('Distribuição de desligamentos'));
    container.appendChild(chartsWrapDistribuicao);
    container.appendChild(sectionHeader('Rankings', 'Lojas, supervisores e funções com maior volume de desligamentos no período'));
    container.appendChild(rankingWrap);

    function update(state) {
      const { busca, ...matchFilters } = state;

      const BUSCA_FIELDS = ['COLABORADOR', 'COLABORADOR_ABREVIADO'];
      let admissoes = Utils.filterByBusca(Filters.applyFilters(admissoesAno, matchFilters), busca, BUSCA_FIELDS);
      let desligamentos = Utils.filterByBusca(Filters.applyFilters(desligamentosAno, matchFilters), busca, BUSCA_FIELDS);

      const headcountTotal = lojasRes.data
        .filter((l) => !state.LOJA || l.LOJA === state.LOJA)
        .reduce((sum, l) => sum + (l.HEADCOUNT || 0), 0);

      const turnoverPct = headcountTotal > 0 ? (desligamentos.length / headcountTotal) * 100 : null;
      const admissoesEmAndamento = admissoes.filter((r) => (r.STATUS || '').toUpperCase() !== 'FINALIZADO').length;
      const avgTenureDays = computeAvgTenureDays(admissoes, desligamentos);

      const lojaStats = groupMovStats(admissoes, desligamentos, 'LOJA');
      const supervisorStats = groupMovStats(admissoes, desligamentos, 'SUPERVISOR');
      const gerenteStats = groupMovStats(admissoes, desligamentos, 'GERENTE');
      const funcaoStats = groupMovStats(admissoes, desligamentos, 'FUNCAO');

      const topLoja = lojaStats[0];
      const topSupervisor = supervisorStats[0];
      const topFuncao = funcaoStats[0];

      const rescisoesEmAndamento = rescisoesRes.ok
        ? Utils.formatNumber(rescisoesRes.data.length)
        : '—';

      /* ------------------------------ KPIs ------------------------------ */
      Utils.emptyNode(kpiWrap);
      kpiWrap.appendChild(kpiGrid([
        { icon: 'admissoes', label: 'Admissões', value: Utils.formatNumber(admissoes.length), loading },
        { icon: 'desligamentos', label: 'Desligamentos', value: Utils.formatNumber(desligamentos.length), loading },
        { icon: 'admissoes', label: 'Admissões em andamento', value: Utils.formatNumber(admissoesEmAndamento), delta: 'Ainda não finalizadas', loading },
        {
          icon: 'rescisoes', label: 'Rescisões em andamento', value: rescisoesEmAndamento,
          delta: rescisoesRes.ok ? '' : 'Base ainda não conectada', loading,
        },
        { icon: 'turnover', label: 'Turnover geral', value: turnoverPct === null ? '—' : Utils.formatPercent(turnoverPct), delta: headcountTotal ? `${Utils.formatNumber(headcountTotal)} colaboradores no headcount` : '', loading },
        {
          icon: 'bancoHoras', label: 'Tempo médio até o desligamento',
          value: avgTenureDays === null ? '—' : `${Utils.formatNumber(Math.round(avgTenureDays))} dias`,
          delta: avgTenureDays === null ? '' : `≈ ${(avgTenureDays / 30).toFixed(1)} meses`,
          loading,
        },
        {
          icon: 'desligamentos', label: 'Loja com mais desligamentos',
          value: loading ? '—' : (topLoja ? topLoja.key : '—'),
          delta: topLoja ? `${Utils.formatNumber(topLoja.desligamentos)} desligamento${topLoja.desligamentos === 1 ? '' : 's'}` : '',
          loading,
        },
        {
          icon: 'desligamentos', label: 'Supervisor com mais desligamentos',
          value: loading ? '—' : (topSupervisor ? topSupervisor.key : '—'),
          delta: topSupervisor ? `${Utils.formatNumber(topSupervisor.desligamentos)} desligamento${topSupervisor.desligamentos === 1 ? '' : 's'}` : '',
          loading,
        },
        {
          icon: 'turnover', label: 'Função com maior turnover',
          value: loading ? '—' : (topFuncao ? topFuncao.key : '—'),
          delta: topFuncao ? `${Utils.formatNumber(topFuncao.desligamentos)} desligamento${topFuncao.desligamentos === 1 ? '' : 's'}` : '',
          loading,
        },
      ]));

      /* ------------------------- Gráficos: tendências mensais ------------------------- */
      const mesesDesligamentos = mesesPresentes(desligamentos);
      const mesesAdmissoes = mesesPresentes(admissoes);
      const mesesComparativo = mesesPresentes([...admissoes, ...desligamentos]);

      Utils.emptyNode(chartsWrapMovimentacao);
      chartsWrapMovimentacao.appendChild(realChartGrid([
        {
          title: 'Desligamentos por mês',
          type: 'bar',
          data: {
            labels: mesesDesligamentos,
            datasets: [{ label: 'Desligamentos', data: mesesDesligamentos.map((m) => desligamentos.filter((r) => r.MES === m).length), backgroundColor: Charts.PALETTE[3] }],
          },
          options: { plugins: { legend: { display: false } } },
        },
        {
          title: 'Admissões por mês',
          type: 'bar',
          data: {
            labels: mesesAdmissoes,
            datasets: [{ label: 'Admissões', data: mesesAdmissoes.map((m) => admissoes.filter((r) => r.MES === m).length), backgroundColor: Charts.PALETTE[2] }],
          },
          options: { plugins: { legend: { display: false } } },
        },
        {
          title: 'Comparativo mensal — Admissões x Desligamentos',
          type: 'bar',
          data: {
            labels: mesesComparativo,
            datasets: [
              { label: 'Admissões', data: mesesComparativo.map((m) => admissoes.filter((r) => r.MES === m).length), backgroundColor: Charts.PALETTE[2] },
              { label: 'Desligamentos', data: mesesComparativo.map((m) => desligamentos.filter((r) => r.MES === m).length), backgroundColor: Charts.PALETTE[3] },
            ],
          },
        },
      ]));

      /* ------------------------- Gráficos: distribuição de desligamentos ------------------------- */
      Utils.emptyNode(chartsWrapDistribuicao);
      chartsWrapDistribuicao.appendChild(realChartGrid([
        {
          title: 'Desligamentos por loja',
          type: 'bar',
          data: {
            labels: lojaStats.slice(0, 10).map((s) => s.key),
            datasets: [{ label: 'Desligamentos', data: lojaStats.slice(0, 10).map((s) => s.desligamentos), backgroundColor: Charts.PALETTE[3] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Desligamentos por supervisor',
          type: 'bar',
          data: {
            labels: supervisorStats.slice(0, 10).map((s) => s.key),
            datasets: [{ label: 'Desligamentos', data: supervisorStats.slice(0, 10).map((s) => s.desligamentos), backgroundColor: Charts.PALETTE[4] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Desligamentos por gerente',
          type: 'bar',
          data: {
            labels: gerenteStats.slice(0, 10).map((s) => s.key),
            datasets: [{ label: 'Desligamentos', data: gerenteStats.slice(0, 10).map((s) => s.desligamentos), backgroundColor: Charts.PALETTE[0] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Desligamentos por função',
          type: 'donut',
          data: {
            labels: funcaoStats.map((s) => s.key),
            datasets: [{ data: funcaoStats.map((s) => s.desligamentos), backgroundColor: funcaoStats.map((_, i) => Charts.PALETTE[i % Charts.PALETTE.length]) }],
          },
        },
      ]));

      /* ------------------------------ Rankings ------------------------------ */
      Utils.emptyNode(rankingWrap);
      rankingWrap.appendChild(rankingGrid([
        rankingCard({ title: 'Ranking das lojas', items: lojaStats.slice(0, 8) }),
        rankingCard({ title: 'Ranking dos supervisores', items: supervisorStats.slice(0, 8) }),
        rankingCard({ title: 'Ranking das funções', items: funcaoStats.slice(0, 8) }),
      ]));
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'ANO', label: 'Ano', options: Utils.uniqueValues(combinedForOptions, 'ANO') },
      { key: 'MES', label: 'Mês', options: mesesPresentes(combinedForOptions) },
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(lojasRes.data.length ? lojasRes.data : combinedForOptions, 'LOJA') },
      { key: 'SUPERVISOR', label: 'Supervisor', options: Utils.uniqueValues(combinedForOptions, 'SUPERVISOR') },
      { key: 'GERENTE', label: 'Gerente', options: Utils.uniqueValues(combinedForOptions, 'GERENTE') },
      { key: 'FUNCAO', label: 'Função', options: Utils.uniqueValues(combinedForOptions, 'FUNCAO') },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => { persistFilterState('dashboard', state); update(state); });

    if (filterStateByModule.dashboard) filterApi.setState(filterStateByModule.dashboard);
    update(filterApi.getState());
  }

  function renderAdmissoes(container) {
    const res = DATASETS.admissoes;
    const loading = !hasLoadedOnce;
    if (!loading && !res.ok) container.appendChild(errorBannerFor('admissoes', res));

    container.appendChild(sectionHeader(
      'Admissões',
      'Painel de acompanhamento dos processos de admissão, da documentação até a conclusão — para gerentes e supervisores acompanharem o andamento sem precisar perguntar ao RH'
    ));

    const cardsWrap = Utils.el('div');
    const filterWrap = Utils.el('div');
    const tableWrap = Utils.el('div');

    const chartsWrap = Utils.el('div');

    container.appendChild(cardsWrap);
    container.appendChild(filterWrap);
    container.appendChild(sectionHeader('Tendências'));
    container.appendChild(chartsWrap);
    container.appendChild(sectionHeader('Registros de admissão', 'Clique em um registro para ver a linha do tempo do processo'));
    container.appendChild(tableWrap);

    // Base completa já com o status classificado (STATUS_INFO / STATUS_LABEL), antes dos filtros.
    const processadas = buildAdmissoesProcessadas(res.data);

    function update(state) {
      const { STATUS_LABEL, busca, ...matchFilters } = state;
      const base = Utils.filterByBusca(
        Filters.applyFilters(processadas, matchFilters), busca, ['COLABORADOR', 'COLABORADOR_ABREVIADO']
      );

      const filtered = STATUS_LABEL ? base.filter((r) => r.STATUS_LABEL === STATUS_LABEL) : base;
      const countFor = (label) => base.filter((r) => r.STATUS_LABEL === label).length;

      /* ------------------------- Cards de status (clicáveis) ------------------------- */
      Utils.emptyNode(cardsWrap);
      const stageCards = ADMISSAO_STATUS_STAGES.map((stage) => ({
        label: stage.label, variant: stage.variant, icon: stage.icon,
        value: countFor(stage.label), loading, active: STATUS_LABEL === stage.label,
        onClick: () => {
          const next = STATUS_LABEL === stage.label ? '' : stage.label;
          filterApi.setState({ STATUS_LABEL: next });
          persistFilterState('admissoes', filterApi.getState());
          update(filterApi.getState());
        },
      }));
      stageCards.push({
        label: ADMISSAO_STATUS_CANCELADO.label, variant: ADMISSAO_STATUS_CANCELADO.variant, icon: ADMISSAO_STATUS_CANCELADO.icon,
        value: countFor(ADMISSAO_STATUS_CANCELADO.label), loading, active: STATUS_LABEL === ADMISSAO_STATUS_CANCELADO.label,
        onClick: () => {
          const next = STATUS_LABEL === ADMISSAO_STATUS_CANCELADO.label ? '' : ADMISSAO_STATUS_CANCELADO.label;
          filterApi.setState({ STATUS_LABEL: next });
          persistFilterState('admissoes', filterApi.getState());
          update(filterApi.getState());
        },
      });
      cardsWrap.appendChild(admissaoStatusGrid(stageCards));

      /* ------------------------------ Gráficos: Tendências ------------------------------ */
      const porLoja = Utils.groupBy(base, 'LOJA');
      const lojasOrdenadas = Object.keys(porLoja)
        .filter((k) => k && k !== 'undefined')
        .sort((a, b) => porLoja[b].length - porLoja[a].length)
        .slice(0, 10);

      const porFuncao = Utils.groupBy(base, 'FUNCAO');
      const funcoesOrdenadas = Object.keys(porFuncao)
        .filter((k) => k && k !== 'undefined')
        .sort((a, b) => porFuncao[b].length - porFuncao[a].length);

      Utils.emptyNode(chartsWrap);
      chartsWrap.appendChild(realChartGrid([
        {
          title: 'Admissões por loja',
          type: 'bar',
          data: {
            labels: lojasOrdenadas,
            datasets: [{ label: 'Admissões', data: lojasOrdenadas.map((l) => porLoja[l].length), backgroundColor: Charts.PALETTE[2] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Admissões por função',
          type: 'donut',
          data: {
            labels: funcoesOrdenadas,
            datasets: [{ data: funcoesOrdenadas.map((f) => porFuncao[f].length), backgroundColor: funcoesOrdenadas.map((_, i) => Charts.PALETTE[i % Charts.PALETTE.length]) }],
          },
        },
      ]));

      /* ------------------------------ Tabela ------------------------------ */
      Utils.emptyNode(tableWrap);
      tableWrap.appendChild(dataTableCard({
        title: 'Admissões',
        columns: ['Nome', 'Loja', 'Supervisor', 'Gerente', 'Função', 'Status', 'Data prevista'],
        rows: sortByDateAsc(filtered),
        loading,
        onRowClick: (r) => openAdmissaoDetail(r),
        mapRow: (r) => [
          td(r.COLABORADOR), td(r.LOJA), td(r.SUPERVISOR), td(r.GERENTE), td(r.FUNCAO),
          tdTag(r.STATUS_LABEL, r.STATUS_INFO.variant), td(Utils.formatDate(r.DATA)),
        ],
      }));
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(res.data, 'LOJA') },
      { key: 'SUPERVISOR', label: 'Supervisor', options: Utils.uniqueValues(res.data, 'SUPERVISOR') },
      { key: 'GERENTE', label: 'Gerente', options: Utils.uniqueValues(res.data, 'GERENTE') },
      { key: 'FUNCAO', label: 'Função', options: Utils.uniqueValues(res.data, 'FUNCAO') },
      { key: 'MES', label: 'Mês', options: mesesPresentes(res.data) },
      { key: 'STATUS_LABEL', label: 'Status', options: [...ADMISSAO_STATUS_STAGES.map((s) => s.label), ADMISSAO_STATUS_CANCELADO.label] },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => { persistFilterState('admissoes', state); update(state); });

    if (filterStateByModule.admissoes) filterApi.setState(filterStateByModule.admissoes);
    update(filterApi.getState());
  }

  function renderDesligamentos(container) {
    const res = DATASETS.desligamentos;
    const loading = !hasLoadedOnce;
    if (!loading && !res.ok) container.appendChild(errorBannerFor('desligamentos', res));

    const filterWrap = Utils.el('div');
    const alertWrap = Utils.el('div');
    const kpiWrap = Utils.el('div');
    const tableWrap = Utils.el('div');

    const chartsWrap = Utils.el('div');

    container.appendChild(filterWrap);
    container.appendChild(sectionHeader('Desligamentos', 'Encerramentos de contrato por loja e período'));
    container.appendChild(alertWrap);
    container.appendChild(kpiWrap);
    container.appendChild(sectionHeader('Tendências'));
    container.appendChild(chartsWrap);
    container.appendChild(sectionHeader('Registros de desligamento'));
    container.appendChild(tableWrap);

    function statusDesligamentoVariant(status) {
      const s = (status || '').toUpperCase();
      if (s.includes('FINALIZADO')) return 'success';
      if (s.includes('PAGAMENTO')) return 'warning';
      if (s.includes('PENDENTE')) return 'urgent';
      if (s.includes('CANCELADO')) return 'danger';
      return 'neutral';
    }

    function update(state) {
      const { busca, ...matchFilters } = state;
      const filtered = Utils.filterByBusca(
        Filters.applyFilters(res.data, matchFilters), busca, ['COLABORADOR', 'COLABORADOR_ABREVIADO']
      );
      const countByAviso = (tipo) => filtered.filter((r) => (r.TIPO_AVISO || '').toLowerCase().includes(tipo)).length;

      // Mesmo cálculo de prazo usado no módulo "Controle de Rescisões" (30 dias de
      // trabalhado + 9 de projeção = 39; 9 dias corridos para indenizado/dispensa de
      // aviso), aplicado aqui para sinalizar na própria tabela de Desligamentos quais
      // registros estão vencidos ou perto do vencimento — sem precisar abrir o outro módulo.
      const filteredComPrazo = buildRescisoes(filtered);
      const vencidos = filteredComPrazo.filter((r) => r.STATUS_RESCISAO.nivel === 'VENCIDO').length;
      const urgentes = filteredComPrazo.filter((r) => r.STATUS_RESCISAO.nivel === 'URGENTE').length;

      Utils.emptyNode(alertWrap);
      if (!loading && (vencidos > 0 || urgentes > 0)) {
        const partes = [];
        if (vencidos > 0) partes.push(`${Utils.formatNumber(vencidos)} vencido${vencidos === 1 ? '' : 's'}`);
        if (urgentes > 0) partes.push(`${Utils.formatNumber(urgentes)} urgente${urgentes === 1 ? '' : 's'} (prazo em até 5 dias)`);
        alertWrap.appendChild(alertBanner({
          title: 'Atenção: existem desligamentos com prazo de rescisão vencendo',
          message: `${partes.join(' e ')}. Veja a coluna "Vencimento" na tabela abaixo ou acesse Controle de Rescisões para o detalhamento completo.`,
          variant: vencidos > 0 ? 'error' : 'warning',
        }));
      }

      Utils.emptyNode(kpiWrap);
      kpiWrap.appendChild(kpiGrid([
        { icon: 'desligamentos', label: 'Total no período', value: Utils.formatNumber(filtered.length), loading },
        { icon: 'desligamentos', label: 'Aviso trabalhado', value: Utils.formatNumber(countByAviso('trabalhado')), loading },
        { icon: 'desligamentos', label: 'Indenizados', value: Utils.formatNumber(countByAviso('indenizado')), loading },
        { icon: 'desligamentos', label: 'Dispensa de aviso', value: Utils.formatNumber(countByAviso('dispensa')), loading },
      ]));

      /* ------------------------------ Gráficos: Tendências ------------------------------ */
      const porAviso = Utils.groupBy(filtered, 'TIPO_AVISO');
      const avisosOrdenados = Object.keys(porAviso).filter((k) => k && k !== 'undefined');

      const porLojaDeslig = Utils.groupBy(filtered, 'LOJA');
      const lojasDeslig = Object.keys(porLojaDeslig)
        .filter((k) => k && k !== 'undefined')
        .sort((a, b) => porLojaDeslig[b].length - porLojaDeslig[a].length)
        .slice(0, 10);

      Utils.emptyNode(chartsWrap);
      chartsWrap.appendChild(realChartGrid([
        {
          title: 'Desligamentos por tipo de aviso',
          type: 'donut',
          data: {
            labels: avisosOrdenados,
            datasets: [{ data: avisosOrdenados.map((a) => porAviso[a].length), backgroundColor: avisosOrdenados.map((_, i) => Charts.PALETTE[i % Charts.PALETTE.length]) }],
          },
        },
        {
          title: 'Desligamentos por loja',
          type: 'bar',
          data: {
            labels: lojasDeslig,
            datasets: [{ label: 'Desligamentos', data: lojasDeslig.map((l) => porLojaDeslig[l].length), backgroundColor: Charts.PALETTE[3] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
      ]));

      Utils.emptyNode(tableWrap);
      tableWrap.appendChild(dataTableCard({
        title: 'Desligamentos',
        columns: ['Colaborador', 'Tipo de documento', 'Tipo de aviso', 'Data', 'Loja', 'Mês', 'Gerente', 'Supervisor', 'Função', 'Status', 'Vencimento'],
        rows: sortByDateDesc(filteredComPrazo),
        loading,
        rowClass: (r) => {
          if (r.STATUS_RESCISAO.nivel === 'VENCIDO') return 'row-vencido';
          if (r.STATUS_RESCISAO.nivel === 'URGENTE') return 'row-urgente';
          return '';
        },
        mapRow: (r) => [
          td(r.COLABORADOR), td(r.TIPO_DOC), td(r.TIPO_AVISO), td(Utils.formatDate(r.DATA)),
          td(r.LOJA), td(r.MES), td(r.GERENTE), td(r.SUPERVISOR), td(r.FUNCAO),
          tdTag(r.STATUS, statusDesligamentoVariant(r.STATUS)),
          tdTag(
            (r.DIAS_RESTANTES === null || r.STATUS_RESCISAO.nivel === 'FINALIZADO')
              ? r.STATUS_RESCISAO.label
              : (r.DIAS_RESTANTES < 0
                ? `Vencido há ${Math.abs(r.DIAS_RESTANTES)} dia(s)`
                : (r.DIAS_RESTANTES === 0 ? 'Vence hoje' : `${r.DIAS_RESTANTES} dia(s)`)),
            r.STATUS_RESCISAO.variant
          ),
        ],
      }));
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(res.data, 'LOJA') },
      { key: 'MES', label: 'Mês', options: mesesPresentes(res.data) },
      { key: 'TIPO_DOC', label: 'Tipo de documento', options: Utils.uniqueValues(res.data, 'TIPO_DOC') },
      { key: 'TIPO_AVISO', label: 'Tipo de aviso', options: Utils.uniqueValues(res.data, 'TIPO_AVISO') },
      { key: 'STATUS', label: 'Status', options: Utils.uniqueValues(res.data, 'STATUS') },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => { persistFilterState('desligamentos', state); update(state); });

    if (filterStateByModule.desligamentos) filterApi.setState(filterStateByModule.desligamentos);
    update(filterApi.getState());
  }

  /* --------------------------------------------------------------------
   * 5c-bis. PAINEL "MODALIDADES & DICAS DE GESTÃO" (Controle de Rescisões)
   * ------------------------------------------------------------------
   * Conteúdo de referência/educacional — não depende de nenhuma planilha.
   * Objetivo: explicar cada modalidade de rescisão prevista na CLT (quem
   * pode iniciá-la, direitos envolvidos, base legal e nível de custo típico
   * para a empresa) e reunir dicas de gestão que ajudam o RH a decidir com
   * mais inteligência (timing, modalidade mais vantajosa, alertas de risco),
   * aplicando conceitos consagrados de administração.
   * IMPORTANTE: conteúdo informativo e geral — não substitui a orientação
   * do jurídico/contábil da empresa em casos concretos.
   * ------------------------------------------------------------------ */

  // Nível de custo típico para a empresa em cada modalidade — usado tanto no
  // badge do card quanto na barra do "termômetro de custo".
  const CUSTO_NIVEL = {
    baixo:    { label: 'Custo baixo',    variant: 'success', pct: 25 },
    medio:    { label: 'Custo médio',    variant: 'warning', pct: 55 },
    alto:     { label: 'Custo alto',     variant: 'danger',  pct: 90 },
    variavel: { label: 'Custo variável', variant: 'neutral', pct: 45 },
  };

  const MODALIDADES_RESCISAO = [
    {
      id: 'sem-justa-causa',
      nome: 'Dispensa sem justa causa',
      iniciativa: 'Empregador',
      custo: 'alto',
      resumo: 'A empresa encerra o contrato sem que o colaborador tenha cometido falta grave.',
      baseLegal: 'CLT, arts. 477 e 487 · Lei 12.506/2011 (aviso prévio proporcional)',
      direitos: [
        'Saldo de salário dos dias trabalhados',
        'Aviso prévio (30 dias + 3 por ano de casa, até 90 dias), trabalhado ou indenizado',
        '13º salário proporcional',
        'Férias vencidas (se houver) e proporcionais, ambas + 1/3',
        'Saque integral do FGTS + multa de 40% sobre o saldo',
        'Direito ao seguro-desemprego (se atendidos os requisitos)',
      ],
      gestao: 'É a modalidade com o "pacote completo" de verbas — normalmente a mais cara para a empresa. Reserve-a para desligamentos realmente sem outra saída, com decisão bem documentada.',
    },
    {
      id: 'justa-causa',
      nome: 'Dispensa por justa causa',
      iniciativa: 'Empregador',
      custo: 'baixo',
      resumo: 'Aplicada quando o colaborador comete falta grave prevista em lei (ex: ato de indisciplina, insubordinação, abandono de emprego).',
      baseLegal: 'CLT, art. 482',
      direitos: [
        'Saldo de salário dos dias trabalhados',
        'Férias vencidas + 1/3 (sem as proporcionais)',
        'Sem aviso prévio',
        'Sem multa de 40% do FGTS e sem liberação para saque',
        'Sem acesso ao seguro-desemprego',
      ],
      gestao: 'É a mais barata, mas também a de maior risco jurídico: exige prova documental robusta (advertências, testemunhas, registros). Se revertida na Justiça, a empresa paga tudo retroativo como sem justa causa, além de possível dano moral — nunca use como "atalho" de custo.',
    },
    {
      id: 'pedido-demissao',
      nome: 'Pedido de demissão',
      iniciativa: 'Empregado',
      custo: 'baixo',
      resumo: 'O próprio colaborador decide encerrar o contrato por iniciativa própria.',
      baseLegal: 'CLT, art. 487, §2º',
      direitos: [
        'Saldo de salário e férias vencidas + 1/3',
        'Férias proporcionais + 1/3 e 13º proporcional',
        'Sem multa de 40% do FGTS e sem liberação para saque',
        'Sem seguro-desemprego',
        'Se não cumprir o aviso prévio, a empresa pode descontar o valor correspondente',
      ],
      gestao: 'Atenção: induzir ou pressionar um colaborador a "pedir demissão" para evitar a multa de uma dispensa sem justa causa configura fraude (simulação) e pode ser revertido judicialmente — com a empresa pagando tudo em dobro. Só é legítimo quando a decisão parte de fato do colaborador.',
    },
    {
      id: 'acordo-484a',
      nome: 'Rescisão por acordo (Art. 484-A)',
      iniciativa: 'Mútua (empresa + colaborador)',
      custo: 'medio',
      resumo: 'Criada pela Reforma Trabalhista de 2017: as duas partes concordam em encerrar o vínculo, dividindo custos e benefícios.',
      baseLegal: 'CLT, art. 484-A (incluído pela Lei 13.467/2017)',
      direitos: [
        'Aviso prévio indenizado pago pela metade (ou integral, se trabalhado)',
        'Multa do FGTS de 20% sobre o saldo (metade da multa normal)',
        'Saque de até 80% do saldo do FGTS',
        '13º e férias proporcionais + 1/3, integrais',
        'Sem direito ao seguro-desemprego',
      ],
      gestao: 'Ótimo equilíbrio custo × relacionamento quando o desligamento é mesmo consensual. Mas precisa ser genuíno: usá-lo para disfarçar uma dispensa imposta ao colaborador pode ser anulado na Justiça do Trabalho, voltando a custar como dispensa sem justa causa.',
    },
    {
      id: 'rescisao-indireta',
      nome: 'Rescisão indireta',
      iniciativa: 'Empregado (por falha do empregador)',
      custo: 'alto',
      resumo: '"Justa causa do empregador": o colaborador pede a rescisão porque a empresa descumpriu obrigações do contrato (ex: atraso salarial recorrente, assédio, risco à saúde/segurança).',
      baseLegal: 'CLT, art. 483',
      direitos: [
        'Mesmos direitos da dispensa sem justa causa (aviso, 13º e férias proporcionais, FGTS + multa de 40%, saque e seguro-desemprego)',
        'Possibilidade de indenização adicional por danos morais, reconhecida judicialmente',
      ],
      gestao: 'É a modalidade mais cara e mais arriscada: costuma vir acompanhada de ação trabalhista. A melhor estratégia é prevenção — manter em dia obrigações contratuais (salário, ambiente de trabalho, jornada) elimina o risco na origem.',
    },
    {
      id: 'termino-experiencia',
      nome: 'Término de contrato de experiência / prazo determinado',
      iniciativa: 'Automático (fim da data combinada)',
      custo: 'baixo',
      resumo: 'O contrato chega ao fim natural da data combinada (ex: contrato de experiência de até 90 dias).',
      baseLegal: 'CLT, arts. 445, 479 e 480',
      direitos: [
        'Saldo de salário e férias proporcionais + 1/3',
        '13º salário proporcional',
        'Sem aviso prévio e sem multa do FGTS, se encerrado na data prevista',
        'Se antecipado sem cláusula assecuratória, indenização de metade do período restante',
      ],
      gestao: 'Baixo custo e baixo risco quando a data é respeitada. Sempre inclua a cláusula assecuratória de rescisão recíproca no contrato — ela evita indenização extra em caso de encerramento antecipado.',
    },
    {
      id: 'aposentadoria',
      nome: 'Aposentadoria',
      iniciativa: 'Empregado (voluntária)',
      custo: 'variavel',
      resumo: 'O colaborador se aposenta e opta por encerrar o vínculo empregatício.',
      baseLegal: 'Lei 8.213/1991 · CLT',
      direitos: [
        'Se por iniciativa do colaborador: direitos semelhantes ao pedido de demissão',
        'Se a empresa dispensar o colaborador já aposentado sem justa causa: direitos completos de uma dispensa sem justa causa se aplicam normalmente',
      ],
      gestao: 'A aposentadoria, isoladamente, não extingue o contrato de trabalho de forma automática — o entendimento atual exige formalização própria. Trate cada caso com orientação jurídica antes de presumir o encerramento do vínculo.',
    },
  ];

  const DICAS_GESTAO_RESCISAO = [
    {
      icon: 'calendar',
      titulo: 'Formalize o desligamento logo após o pagamento do salário',
      texto: 'Encerrar o contrato nos primeiros dias após a folha já ter sido paga reduz o saldo de salário a calcular e dá ao RH os 10 dias corridos do prazo legal (CLT, art. 477, §6º) inteiros para revisar os cálculos com calma — sem correr contra o fechamento do mês.',
      conceito: 'Peter Drucker — "eficiência é fazer certo as coisas; eficácia é fazer as coisas certas": aplicar disciplina operacional a um processo geralmente tratado de forma reativa.',
    },
    {
      icon: 'scale',
      titulo: 'Confirme períodos de estabilidade antes de decidir a data',
      texto: 'Gestantes, membros da CIPA, colaboradores afastados por acidente de trabalho ou em pré-aviso de aposentadoria (conforme a convenção coletiva) têm estabilidade provisória. Desligar durante esse período sem causa costuma gerar reintegração ou indenização — o "prejuízo evitável" mais comum em rescisões.',
      conceito: 'Gestão de risco aplicada ao desligamento: trate a checagem de estabilidade como um item de checklist obrigatório, não uma exceção.',
    },
    {
      icon: 'coin',
      titulo: 'Meça o custo real de cada modalidade antes de agir',
      texto: 'Antes de formalizar, compare o custo de cada modalidade aplicável ao caso (veja o termômetro abaixo) e documente por que a escolhida foi a mais adequada — isso protege a empresa em uma eventual auditoria ou reclamação trabalhista.',
      conceito: 'Vicente Falconi — ciclo PDCA (Planejar, Fazer, Checar, Agir) e "gestão à vista": decisão de desligamento também é processo, não improviso.',
    },
    {
      icon: 'trendUp',
      titulo: 'Priorize o acordo mútuo (484-A) em saídas consensuais',
      texto: 'Quando o colaborador já está insatisfeito ou buscando outra oportunidade, oferecer o acordo mútuo reduz a multa do FGTS de 40% para 20% e tende a reduzir o risco de ação trabalhista, preservando a relação e a reputação da empresa.',
      conceito: 'Ricardo Semler (Semco) — soluções negociadas e transparentes rendem mais do que decisões impostas unilateralmente.',
    },
    {
      icon: 'auditorias',
      titulo: 'Trate a justa causa como último recurso documentado',
      texto: 'Nunca use a justa causa como "atalho" para economizar: ela só se sustenta com um histórico real de advertências e evidências. Um processo estruturado de feedback e PIP (plano de melhoria) antes do desligamento reduz o risco de reversão judicial — que custa muito mais do que a economia inicial.',
      conceito: 'Jack Welch — diferenciação de performance: a decisão de desligar deve ser a etapa final de um processo contínuo de gestão, não um atalho.',
    },
    {
      icon: 'lightbulb',
      titulo: 'Antecipe desligamentos por baixa performance',
      texto: 'Ciclos regulares de avaliação permitem identificar baixa performance cedo e escolher a modalidade certa com calma — em vez de desligar sob pressão, de forma reativa e mais cara (geralmente sem justa causa, no calor do momento).',
      conceito: 'Jack Welch (curva de vitalidade) e Ichak Adizes (ciclo de vida organizacional) — gerir o desempenho continuamente evita decisões de última hora.',
    },
  ];

  /** Badge de custo (baixo/médio/alto/variável) usado nos cards de modalidade e no termômetro. */
  function custoTag(nivel) {
    const info = CUSTO_NIVEL[nivel] || CUSTO_NIVEL.variavel;
    return Utils.el('span', { class: `tag tag--${info.variant}`, text: info.label });
  }

  /** Card individual de uma modalidade de rescisão — resumo + botão que abre o detalhe completo em modal. */
  function modalidadeCard(mod) {
    const card = Utils.el('article', { class: 'modalidade-card' });
    card.appendChild(Utils.el('div', { class: 'modalidade-card__header' }, [
      Utils.el('h3', { class: 'modalidade-card__title', text: mod.nome }),
      custoTag(mod.custo),
    ]));
    card.appendChild(Utils.el('p', { class: 'modalidade-card__iniciativa', text: `Quem inicia: ${mod.iniciativa}` }));
    card.appendChild(Utils.el('p', { class: 'modalidade-card__resumo', text: mod.resumo }));

    const btn = Utils.el('button', { class: 'btn btn--sm modalidade-card__btn', type: 'button' }, [
      Utils.el('span', { text: 'Ver detalhes completos' }),
    ]);
    btn.addEventListener('click', () => openModal({
      title: mod.nome,
      subtitle: `Quem inicia: ${mod.iniciativa} · Base legal: ${mod.baseLegal}`,
      bodyEl: modalidadeDetalheBody(mod),
    }));
    card.appendChild(btn);
    return card;
  }

  /** Conteúdo do modal de detalhe de uma modalidade: direitos envolvidos + leitura de gestão. */
  function modalidadeDetalheBody(mod) {
    const wrap = Utils.el('div', { class: 'modalidade-detalhe' });
    wrap.appendChild(Utils.el('h4', { class: 'modalidade-detalhe__subtitle', text: 'O que está envolvido' }));
    wrap.appendChild(Utils.el('ul', { class: 'modalidade-detalhe__list' },
      mod.direitos.map((d) => Utils.el('li', { text: d }))));
    wrap.appendChild(Utils.el('h4', { class: 'modalidade-detalhe__subtitle', text: 'Leitura de gestão' }));
    wrap.appendChild(Utils.el('p', { class: 'modalidade-detalhe__gestao', text: mod.gestao }));
    return wrap;
  }

  function modalidadeGrid(list) {
    const grid = Utils.el('div', { class: 'modalidade-grid' });
    list.forEach((m) => grid.appendChild(modalidadeCard(m)));
    return grid;
  }

  /** "Termômetro de custo": compara visualmente o custo típico de cada modalidade para a empresa. */
  function custoTermometro(list) {
    const wrap = Utils.el('div', { class: 'termometro-card' });
    wrap.appendChild(Utils.el('h3', { class: 'termometro-card__title', text: 'Termômetro de custo por modalidade' }));
    wrap.appendChild(Utils.el('p', { class: 'termometro-card__desc', text: 'Comparativo aproximado do custo típico para a empresa — os valores exatos dependem do salário, tempo de casa e convenção coletiva de cada colaborador.' }));

    const ordenado = [...list].sort((a, b) => (CUSTO_NIVEL[a.custo].pct - CUSTO_NIVEL[b.custo].pct));
    ordenado.forEach((mod) => {
      const info = CUSTO_NIVEL[mod.custo];
      wrap.appendChild(Utils.el('div', { class: 'termometro-item' }, [
        Utils.el('span', { class: 'termometro-item__label', text: mod.nome }),
        Utils.el('div', { class: 'termometro-item__bar' }, [
          Utils.el('div', { class: `termometro-item__fill termometro-item__fill--${info.variant}`, style: `width:${info.pct}%` }),
        ]),
        Utils.el('span', { class: `termometro-item__pct termometro-item__pct--${info.variant}`, text: info.label }),
      ]));
    });
    return wrap;
  }

  /** Card individual de dica de gestão, com o conceito de administração aplicado. */
  function dicaCard(dica) {
    return Utils.el('article', { class: 'dica-card' }, [
      Utils.el('div', { class: 'dica-card__icon' }, [iconEl(dica.icon, 20)]),
      Utils.el('div', { class: 'dica-card__body' }, [
        Utils.el('h3', { class: 'dica-card__title', text: dica.titulo }),
        Utils.el('p', { class: 'dica-card__texto', text: dica.texto }),
        Utils.el('p', { class: 'dica-card__conceito', text: dica.conceito }),
      ]),
    ]);
  }

  function dicaGrid(list) {
    const grid = Utils.el('div', { class: 'dica-grid' });
    list.forEach((d) => grid.appendChild(dicaCard(d)));
    return grid;
  }

  /**
   * Monta o painel completo de "Modalidades & Dicas de Gestão": explicação de cada
   * modalidade de rescisão, termômetro de custo, alertas estratégicos e dicas de
   * gestão com conceitos de administração aplicados. Não depende de nenhuma base
   * de dados — é conteúdo de referência fixo, isolado do restante do módulo.
   */
  function renderModalidadesEDicas(container) {
    container.appendChild(sectionHeader(
      'Modalidades de rescisão',
      'Como cada modalidade prevista na CLT funciona, quem pode iniciá-la e o que ela custa para a empresa — clique em um card para ver o detalhe completo'
    ));
    container.appendChild(modalidadeGrid(MODALIDADES_RESCISAO));

    container.appendChild(alertBanner({
      title: 'Onde a empresa mais ganha',
      message: 'Em desligamentos consensuais, o Acordo Mútuo (Art. 484-A) costuma ser o melhor custo-benefício: multa do FGTS pela metade (20%) e menor risco de ação trabalhista do que uma dispensa imposta. Já a Justa Causa só compensa quando há falta grave real e bem documentada — usá-la sem essa base tende a sair mais caro do que teria custado uma dispensa comum.',
      variant: 'success',
    }));
    container.appendChild(alertBanner({
      title: 'Onde a empresa mais perde',
      message: 'Rescisão Indireta é o maior vazamento de caixa evitável: além do pacote completo de verbas, costuma vir com ação trabalhista e risco de indenização por danos morais. "Simular" um pedido de demissão ou um acordo para economizar também é arriscado — se descaracterizado na Justiça, a empresa paga tudo em dobro, retroativo.',
      variant: 'error',
    }));

    container.appendChild(custoTermometro(MODALIDADES_RESCISAO));

    container.appendChild(sectionHeader(
      'Dicas de gestão para o desligamento',
      'Timing, prevenção de risco e conceitos de administração aplicados ao processo de desligamento'
    ));
    container.appendChild(dicaGrid(DICAS_GESTAO_RESCISAO));

    container.appendChild(Utils.el('p', {
      class: 'view__section-desc modalidades-disclaimer',
      text: 'Conteúdo educativo e geral, baseado na CLT — não substitui a análise do jurídico/contábil da empresa para casos concretos, que podem variar conforme convenção coletiva, tempo de casa e histórico do colaborador.',
    }));
  }

  function renderRescisoes(container) {
    // O Controle de Rescisões deriva do mesmo cadastro de Desligamentos (que já
    // contém TIPO_AVISO e DATA) — não depende de nenhuma planilha adicional.
    const res = DATASETS.desligamentos;
    const loading = !hasLoadedOnce;
    if (!loading && !res.ok) container.appendChild(errorBannerFor('desligamentos', res));

    container.appendChild(sectionHeader(
      'Controle de Rescisões',
      'Prazo legal de pagamento da rescisão, calculado automaticamente a partir da data e do tipo de aviso de cada desligamento'
    ));

    /* ------------------------- Abas do módulo ------------------------- *
     * "Processos em aberto" (comportamento original, com dados reais) e
     * "Modalidades & Dicas de Gestão" (painel de referência, ver 5c-bis). */
    const tabBar = Utils.el('div', { class: 'view-tab-bar' });
    const btnProcessos = Utils.el('button', { class: 'view-tab-bar__btn is-active', type: 'button', text: 'Processos em aberto' });
    const btnModalidades = Utils.el('button', { class: 'view-tab-bar__btn', type: 'button', text: 'Modalidades & Dicas de Gestão' });
    tabBar.appendChild(btnProcessos);
    tabBar.appendChild(btnModalidades);
    container.appendChild(tabBar);

    const processosPane = Utils.el('div', { class: 'view-tab-pane' });
    const modalidadesPane = Utils.el('div', { class: 'view-tab-pane', style: 'display:none' });
    container.appendChild(processosPane);
    container.appendChild(modalidadesPane);

    function setActiveTab(tab) {
      const isProcessos = tab === 'processos';
      processosPane.style.display = isProcessos ? '' : 'none';
      modalidadesPane.style.display = isProcessos ? 'none' : '';
      btnProcessos.classList.toggle('is-active', isProcessos);
      btnModalidades.classList.toggle('is-active', !isProcessos);
    }
    btnProcessos.addEventListener('click', () => setActiveTab('processos'));
    btnModalidades.addEventListener('click', () => setActiveTab('modalidades'));

    renderModalidadesEDicas(modalidadesPane);

    const alertWrap = Utils.el('div');
    const summaryWrap = Utils.el('div');
    const filterWrap = Utils.el('div');
    const tableWrap = Utils.el('div');

    processosPane.appendChild(alertWrap);
    processosPane.appendChild(summaryWrap);
    processosPane.appendChild(filterWrap);
    processosPane.appendChild(sectionHeader('Processos de rescisão', 'Ordenados automaticamente do mais urgente para o mais tranquilo'));
    processosPane.appendChild(tableWrap);

    // Base completa já com prazo/dias restantes/status calculados (antes dos filtros).
    const todasRescisoes = buildRescisoes(res.data);

    function update(state) {
      const { busca, ...matchFilters } = state;
      const filtradas = Utils.filterByBusca(
        Filters.applyFilters(todasRescisoes, matchFilters), busca, ['COLABORADOR', 'COLABORADOR_ABREVIADO']
      );

      const ordenadas = sortByUrgencia(filtradas);

      const vencidas = filtradas.filter((r) => r.STATUS_RESCISAO.nivel === 'VENCIDO').length;
      const urgentes = filtradas.filter((r) => r.STATUS_RESCISAO.nivel === 'URGENTE').length;
      const ate15Dias = filtradas.filter((r) => r.DIAS_RESTANTES !== null && r.DIAS_RESTANTES >= 0 && r.DIAS_RESTANTES <= 15).length;
      const ate30Dias = filtradas.filter((r) => r.DIAS_RESTANTES !== null && r.DIAS_RESTANTES >= 0 && r.DIAS_RESTANTES <= 30).length;

      /* ------------------------- Alerta visual imediato ------------------------- *
       * Objetivo: ao abrir o módulo, qualquer rescisão em risco de atraso deve
       * ser vista de imediato — antes até da tabela.                              */
      Utils.emptyNode(alertWrap);
      if (!loading && (vencidas > 0 || urgentes > 0)) {
        const partes = [];
        if (vencidas > 0) partes.push(`${Utils.formatNumber(vencidas)} rescisão${vencidas === 1 ? '' : 'ões'} vencida${vencidas === 1 ? '' : 's'}`);
        if (urgentes > 0) partes.push(`${Utils.formatNumber(urgentes)} urgente${urgentes === 1 ? '' : 's'} (prazo em até 5 dias)`);
        alertWrap.appendChild(alertBanner({
          title: 'Atenção: existem rescisões em risco de atraso',
          message: `${partes.join(' e ')}. Priorize esses processos para evitar multa por atraso no pagamento (CLT, art. 477, §8º).`,
          variant: vencidas > 0 ? 'error' : 'warning',
        }));
      }

      /* ------------------------- Cards de resumo ------------------------- */
      Utils.emptyNode(summaryWrap);
      summaryWrap.appendChild(rescisaoSummaryGrid([
        { label: 'Rescisões vencidas', value: vencidas, variant: 'danger', icon: 'error', loading },
        { label: 'Urgentes (até 5 dias)', value: urgentes, variant: 'urgent', icon: 'warning', loading },
        { label: 'Vencendo em até 15 dias', value: ate15Dias, variant: 'warning', icon: 'bancoHoras', loading },
        { label: 'Vencendo em até 30 dias', value: ate30Dias, variant: 'neutral', icon: 'rescisoes', loading },
      ]));

      /* ------------------------------ Tabela ------------------------------ */
      Utils.emptyNode(tableWrap);
      tableWrap.appendChild(dataTableCard({
        title: 'Controle de Rescisões',
        columns: ['Nome', 'Loja', 'Supervisor', 'Gerente', 'Função', 'Tipo de Aviso', 'Data Inicial', 'Prazo Final', 'Dias Restantes', 'Status'],
        rows: ordenadas,
        loading,
        rowClass: (r) => {
          if (r.STATUS_RESCISAO.nivel === 'VENCIDO') return 'row-vencido';
          if (r.STATUS_RESCISAO.nivel === 'URGENTE') return 'row-urgente';
          return '';
        },
        mapRow: (r) => [
          td(r.COLABORADOR), td(r.LOJA), td(r.SUPERVISOR), td(r.GERENTE), td(r.FUNCAO),
          td(r.TIPO_AVISO), td(Utils.formatDate(r.DATA)), td(Utils.formatDate(r.DATA_LIMITE)),
          td((r.DIAS_RESTANTES === null || r.STATUS_RESCISAO.nivel === 'FINALIZADO') ? '—' : (r.DIAS_RESTANTES < 0
            ? `${Math.abs(r.DIAS_RESTANTES)} dia(s) em atraso`
            : `${r.DIAS_RESTANTES} dia(s)`)),
          tdTag(r.STATUS_RESCISAO.label, r.STATUS_RESCISAO.variant),
        ],
      }));
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(res.data, 'LOJA') },
      { key: 'SUPERVISOR', label: 'Supervisor', options: Utils.uniqueValues(res.data, 'SUPERVISOR') },
      { key: 'GERENTE', label: 'Gerente', options: Utils.uniqueValues(res.data, 'GERENTE') },
      { key: 'FUNCAO', label: 'Função', options: Utils.uniqueValues(res.data, 'FUNCAO') },
      { key: 'TIPO_AVISO', label: 'Tipo de aviso', options: Utils.uniqueValues(res.data, 'TIPO_AVISO') },
      { key: 'STATUS_LABEL', label: 'Status do prazo', options: ['Vencido', 'Urgente', 'Atenção', 'Prazo OK', 'Sem tipo de aviso'] },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => { persistFilterState('rescisoes', state); update(state); });

    if (filterStateByModule.rescisoes) filterApi.setState(filterStateByModule.rescisoes);
    update(filterApi.getState());
  }

  /* --------------------------------------------------------------------
   * 5d. HELPERS DO MÓDULO DE FÉRIAS
   * ------------------------------------------------------------------
   * A planilha de origem traz o STATUS já como texto (USUFRUTO, PENDENTE
   * ou AVALIAR). Além do status bruto, cruzamos aqui com a PREVISÃO para
   * sinalizar quando uma férias PENDENTE já venceu ou está perto de vencer
   * (mesmo princípio de "prazo" já usado no Controle de Rescisões), o que
   * ajuda a priorizar quem precisa de atenção do RH.
   * ------------------------------------------------------------------ */

  const FERIAS_STATUS = {
    USUFRUTO: { label: 'Em usufruto', variant: 'success' },
    PENDENTE: { label: 'Pendente', variant: 'warning' },
    URGENTE: { label: 'Pendente (≤30 dias)', variant: 'urgent' },
    VENCIDA: { label: 'Vencida', variant: 'danger' },
    AVALIAR: { label: 'A avaliar', variant: 'neutral' },
    INDEFINIDO: { label: 'Não informado', variant: 'neutral' },
  };

  /** Classifica o STATUS bruto da linha, refinando um PENDENTE com base na proximidade/vencimento da PREVISÃO. */
  function classifyFeriasStatus(row) {
    const raw = String(row.STATUS || '').toUpperCase();

    if (raw.includes('USUFRUTO')) return FERIAS_STATUS.USUFRUTO;
    if (raw.includes('AVALIAR')) return FERIAS_STATUS.AVALIAR;

    if (raw.includes('PENDENTE')) {
      if (!row.PREVISAO) return FERIAS_STATUS.PENDENTE;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dias = Math.floor((row.PREVISAO - hoje) / (1000 * 60 * 60 * 24));
      if (dias < 0) return FERIAS_STATUS.VENCIDA;
      if (dias <= 30) return FERIAS_STATUS.URGENTE;
      return FERIAS_STATUS.PENDENTE;
    }

    return raw ? { label: raw, variant: 'neutral' } : FERIAS_STATUS.INDEFINIDO;
  }

  /**
   * Retorna a base de Férias já com STATUS_LABEL/STATUS_VARIANT calculados, uma
   * única vez, antes dos filtros. Também calcula PREVISAO_MES (abreviação do
   * mês, ex: "JAN"), já que a planilha de Férias não traz uma coluna de mês
   * própria — o mês é derivado da data de PREVISÃO, no mesmo padrão (MESES_ORDER)
   * usado pelas demais bases. Linhas sem PREVISÃO ficam com PREVISAO_MES vazio.
   */
  function buildFeriasProcessadas(list) {
    return list.map((row) => {
      const info = classifyFeriasStatus(row);
      return {
        ...row,
        STATUS_LABEL: info.label,
        STATUS_VARIANT: info.variant,
        PREVISAO_MES: row.PREVISAO ? MESES_ORDER[row.PREVISAO.getMonth()] : '',
      };
    });
  }

  /** Ordena por urgência (vencida > pendente ≤30 dias > pendente > usufruto > a avaliar) e, dentro do mesmo nível, pela PREVISÃO mais próxima. */
  function sortByFeriasUrgencia(list) {
    const priority = { danger: 0, urgent: 1, warning: 2, success: 3, neutral: 4 };
    return [...list].sort((a, b) => {
      const pa = priority[a.STATUS_VARIANT] ?? 5;
      const pb = priority[b.STATUS_VARIANT] ?? 5;
      if (pa !== pb) return pa - pb;
      const da = a.PREVISAO ? a.PREVISAO.getTime() : Infinity;
      const db = b.PREVISAO ? b.PREVISAO.getTime() : Infinity;
      return da - db;
    });
  }

  /* --------------------------------------------------------------------
   * 5d-bis. ALERTAS DE FÉRIAS — detecção automática de concentração/conflito
   * ------------------------------------------------------------------
   * Analisa a mesma lista já filtrada pela página (Loja, Função, Status, Mês
   * da previsão, Colaborador) e agrupa por mês/ano de PREVISÃO cruzado com
   * LOJA e/ou FUNÇÃO, para avisar o RH sobre concentrações que podem gerar
   * desfalque de equipe. Só considera linhas com PREVISÃO definida — sem
   * data não há "mês" para comparar.
   * ------------------------------------------------------------------ */

  const MESES_NOMES_COMPLETOS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  /** "Agosto/2027" — mês completo + ano, usado quando o agrupamento cruza várias lojas/anos. */
  function mesAnoLabel(date) { return `${MESES_NOMES_COMPLETOS[date.getMonth()]}/${date.getFullYear()}`; }

  /** Só o nome do mês (sem ano), para mensagens já contextualizadas por loja/período filtrado. */
  function mesNomeCompleto(date) { return MESES_NOMES_COMPLETOS[date.getMonth()]; }

  /** "BALCONISTA" -> "Balconista" (preserva acentuação; só ajusta a caixa). */
  function tituloFuncao(funcao) {
    return String(funcao || '').toLowerCase().split(' ').filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /** Pluraliza o nome de uma função para as mensagens de alerta (regras simples do português, cobrindo os padrões mais comuns de cargo). */
  function pluralFuncao(funcao, quantidade) {
    const nome = tituloFuncao(funcao);
    if (quantidade === 1) return nome;
    const lower = nome.toLowerCase();
    if (/m$/.test(lower)) return `${nome.slice(0, -1)}ns`;
    if (/[rsz]$/.test(lower)) return `${nome}es`;
    return `${nome}s`;
  }

  /** Agrupa uma lista de linhas de Férias (com PREVISÃO definida) por uma chave arbitrária. */
  function agruparFerias(rows, getKey) {
    const grupos = new Map();
    rows.forEach((r) => {
      const key = getKey(r);
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(r);
    });
    return [...grupos.values()];
  }

  /**
   * Monta os alertas de conflito de férias a partir da lista já filtrada.
   * Regras:
   *   A. Mesma LOJA + mesma FUNÇÃO no mesmo mês/ano — alerta a partir de 2
   *      colaboradores. NÃO considera a função isoladamente: colaboradores
   *      da mesma função em lojas diferentes nunca geram esse alerta.
   *   B. Mesma LOJA (qualquer função) no mesmo mês/ano — alerta quando são
   *      mais de 3 colaboradores.
   * Retorna sempre um array (vazio quando não há nenhuma concentração).
   */
  function buildFeriasAlertas(rows) {
    const comPrevisao = rows.filter((r) => r.PREVISAO);
    const alertas = [];

    // Regra A: LOJA + FUNÇÃO + mês/ano — exige as três coincidirem.
    agruparFerias(comPrevisao, (r) => `${r.LOJA}||${r.FUNCAO}||${r.PREVISAO.getFullYear()}-${r.PREVISAO.getMonth()}`)
      .filter((grupo) => grupo.length >= 2)
      .forEach((grupo) => {
        alertas.push({
          variant: 'warning',
          title: 'Concentração de férias por loja e função',
          message: `⚠️ Loja ${grupo[0].LOJA} possui ${grupo.length} ${pluralFuncao(grupo[0].FUNCAO, grupo.length)} com férias previstas para ${mesAnoLabel(grupo[0].PREVISAO)}.`,
        });
      });

    // Regra B: LOJA (qualquer função) + mês/ano, mais de 3 colaboradores.
    agruparFerias(comPrevisao, (r) => `${r.LOJA}||${r.PREVISAO.getFullYear()}-${r.PREVISAO.getMonth()}`)
      .filter((grupo) => grupo.length > 3)
      .forEach((grupo) => {
        alertas.push({
          variant: 'warning',
          title: 'Concentração de férias por loja',
          message: `⚠️ Loja ${grupo[0].LOJA} terá ${grupo.length} colaboradores em férias no mês de ${mesNomeCompleto(grupo[0].PREVISAO)}.`,
        });
      });

    return alertas;
  }

  /**
   * KPIs + filtro + alertas + tabela, na mesma identidade visual do restante
   * do portal. Os 4 indicadores do topo (Total cadastradas / Previstas no mês /
   * Pendentes / Em usufruto) usam sempre o componente kpiCard/kpiGrid já
   * existente e são recalculados a partir da MESMA lista filtrada da tabela —
   * ou seja, respondem automaticamente a qualquer filtro aplicado (loja,
   * gerente, supervisor, função, status, mês, busca). A tabela permanece
   * ordenada por urgência (vencida/próxima primeiro).
   */
  function renderFerias(container) {
    const res = DATASETS.ferias;
    const loading = !hasLoadedOnce;
    if (!loading && !res.ok) container.appendChild(errorBannerFor('ferias', res));

    const filterWrap = Utils.el('div');
    const kpiWrap = Utils.el('div');
    const alertasWrap = Utils.el('div');
    const tableWrap = Utils.el('div');

    container.appendChild(filterWrap);
    container.appendChild(sectionHeader(
      'Férias',
      'Colaboradores com férias previstas — use os filtros para localizar rapidamente por loja, função, mês ou status'
    ));
    container.appendChild(kpiWrap);
    container.appendChild(sectionHeader(
      'Alertas de Férias',
      'Concentrações de agenda identificadas automaticamente entre os colaboradores do recorte filtrado'
    ));
    container.appendChild(alertasWrap);
    container.appendChild(sectionHeader('Férias previstas'));
    container.appendChild(tableWrap);

    // Base completa já com o status classificado (STATUS_LABEL / STATUS_VARIANT)
    // e o mês de previsão calculado (PREVISAO_MES), antes dos filtros.
    const processadas = buildFeriasProcessadas(res.data);

    // Abreviação do mês atual (ex: "JAN"), usada como referência padrão do KPI
    // "Férias previstas no mês" quando nenhum mês é escolhido explicitamente no filtro.
    const mesAtual = MESES_ORDER[new Date().getMonth()];

    function update(state) {
      const { busca, ...matchFilters } = state;
      const filtered = Utils.filterByBusca(
        Filters.applyFilters(processadas, matchFilters), busca, ['COLABORADOR']
      );

      /* ------------------------------ KPIs ------------------------------ */
      // 1. Total de colaboradores com férias cadastradas (no recorte filtrado atual).
      const totalCadastradas = filtered.length;

      // 2. Férias previstas para o mês selecionado no filtro "Mês da previsão";
      //    se nenhum mês estiver selecionado, usa o mês atual como referência padrão.
      const mesReferencia = matchFilters.PREVISAO_MES || mesAtual;
      const previstasNoMes = filtered.filter((r) => r.PREVISAO_MES === mesReferencia).length;

      // 3. Férias pendentes: soma de todos os níveis derivados de "PENDENTE"
      //    (pendente comum, pendente ≤30 dias e vencida) — ou seja, tudo que
      //    ainda não foi programado/usufruído.
      const pendentes = filtered.filter((r) => ['warning', 'urgent', 'danger'].includes(r.STATUS_VARIANT)).length;
      const vencidas = filtered.filter((r) => r.STATUS_VARIANT === 'danger').length;

      // 4. Colaboradores atualmente em usufruto.
      const emUsufruto = filtered.filter((r) => r.STATUS_VARIANT === 'success').length;

      Utils.emptyNode(kpiWrap);
      kpiWrap.appendChild(kpiGrid([
        { icon: 'ferias', label: 'Colaboradores com férias cadastradas', value: Utils.formatNumber(totalCadastradas), loading },
        {
          icon: 'calendar',
          label: 'Férias previstas no mês',
          value: Utils.formatNumber(previstasNoMes),
          delta: `Mês de referência: ${mesReferencia}`,
          loading,
        },
        {
          icon: 'warning',
          label: 'Férias pendentes',
          value: Utils.formatNumber(pendentes),
          delta: vencidas > 0 ? `${Utils.formatNumber(vencidas)} vencida${vencidas === 1 ? '' : 's'}` : '',
          deltaDirection: vencidas > 0 ? 'down' : undefined,
          loading,
        },
        { icon: 'trendUp', label: 'Colaboradores em usufruto', value: Utils.formatNumber(emUsufruto), loading },
      ]));

      /* ------------------------------ Alertas de Férias ------------------------------ */
      Utils.emptyNode(alertasWrap);
      if (!loading) {
        const alertas = buildFeriasAlertas(filtered);
        if (alertas.length === 0) {
          alertasWrap.appendChild(alertBanner({
            title: 'Nenhum conflito encontrado',
            message: '✅ Nenhum conflito de férias encontrado para os filtros selecionados.',
            variant: 'success',
          }));
        } else {
          alertas.forEach((a) => alertasWrap.appendChild(alertBanner(a)));
        }
      }

      /* ------------------------------ Tabela ------------------------------ */
      Utils.emptyNode(tableWrap);
      tableWrap.appendChild(dataTableCard({
        title: 'Férias previstas',
        columns: ['Colaborador', 'Admissão', 'Função', 'Loja', 'Previsão', 'Status'],
        rows: sortByFeriasUrgencia(filtered),
        loading,
        mapRow: (r) => [
          td(r.COLABORADOR), td(Utils.formatDate(r.ADMISSAO)), td(r.FUNCAO), td(r.LOJA),
          td(r.PREVISAO ? Utils.formatDate(r.PREVISAO) : null), tdTag(r.STATUS_LABEL, r.STATUS_VARIANT),
        ],
      }));
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(res.data, 'LOJA') },
      { key: 'GERENTE', label: 'Gerente', options: Utils.uniqueValues(res.data, 'GERENTE') },
      { key: 'SUPERVISOR', label: 'Supervisor', options: Utils.uniqueValues(res.data, 'SUPERVISOR') },
      { key: 'FUNCAO', label: 'Função', options: Utils.uniqueValues(res.data, 'FUNCAO') },
      {
        key: 'STATUS_LABEL', label: 'Status',
        options: [
          FERIAS_STATUS.USUFRUTO.label, FERIAS_STATUS.PENDENTE.label,
          FERIAS_STATUS.URGENTE.label, FERIAS_STATUS.VENCIDA.label, FERIAS_STATUS.AVALIAR.label,
        ],
      },
      { key: 'PREVISAO_MES', label: 'Mês da previsão', options: mesesPresentes(processadas, 'PREVISAO_MES') },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => { persistFilterState('ferias', state); update(state); });

    if (filterStateByModule.ferias) filterApi.setState(filterStateByModule.ferias);
    update(filterApi.getState());
  }

  function renderQuebraCaixa(container) {
    const res = DATASETS.quebraCaixa;
    const loading = !hasLoadedOnce;
    if (!loading && !res.ok) container.appendChild(errorBannerFor('quebraCaixa', res));

    const filterWrap = Utils.el('div');
    const kpiWrap = Utils.el('div');
    const chartsWrap = Utils.el('div');
    const rankingColaboradoresWrap = Utils.el('div');
    const rankingLojasWrap = Utils.el('div');
    const rankingGerentesWrap = Utils.el('div');
    const tableWrap = Utils.el('div');

    container.appendChild(filterWrap);
    container.appendChild(sectionHeader(
      'Quebra de Caixa',
      'Consolidado das quebras de caixa registradas por loja, gerente/supervisor e colaborador'
    ));
    container.appendChild(kpiWrap);
    container.appendChild(sectionHeader('Tendências'));
    container.appendChild(chartsWrap);
    container.appendChild(sectionHeader(
      'Rankings',
      'Colaboradores, lojas e gerentes ordenados do maior para o menor valor total de quebra, no período filtrado'
    ));
    container.appendChild(rankingColaboradoresWrap);
    container.appendChild(rankingLojasWrap);
    container.appendChild(rankingGerentesWrap);
    container.appendChild(sectionHeader('Registros de quebra de caixa'));
    container.appendChild(tableWrap);

    function update(state) {
      const { busca, ...matchFilters } = state;
      const filtered = Utils.filterByBusca(
        Filters.applyFilters(res.data, matchFilters), busca, ['COLABORADOR']
      );

      const totalValor = filtered.reduce((sum, r) => sum + (r.VALOR || 0), 0);

      /* ------------------------------ Agregações-base (reaproveitadas pelos KPIs, gráficos e ranking) ------------------------------ */
      const porLoja = Utils.groupBy(filtered, 'LOJA');
      const lojaStats = Object.keys(porLoja)
        .filter((k) => k && k !== 'undefined')
        .map((loja) => ({
          loja,
          valor: porLoja[loja].reduce((s, r) => s + (r.VALOR || 0), 0),
          ocorrencias: porLoja[loja].length,
        }))
        .sort((a, b) => b.valor - a.valor);

      // Mesma base de lojaStats, apenas reordenada por quantidade de ocorrências
      // (não por valor), para o KPI "Loja com maior quantidade de ocorrências".
      const lojaMaisOcorrencias = [...lojaStats].sort((a, b) => b.ocorrencias - a.ocorrencias)[0];

      const porColaborador = Utils.groupBy(filtered, 'COLABORADOR');
      const colaboradorStats = Object.keys(porColaborador)
        .filter((k) => k && k !== 'undefined')
        .map((nome) => {
          const registros = porColaborador[nome];
          return {
            nome,
            valor: registros.reduce((s, r) => s + (r.VALOR || 0), 0),
            ocorrencias: registros.length,
            loja: registros[0] ? registros[0].LOJA : '',
          };
        })
        .sort((a, b) => b.valor - a.valor);

      const porGerente = Utils.groupBy(filtered, 'GERENTE');
      const gerenteStats = Object.keys(porGerente)
        .filter((k) => k && k !== 'undefined')
        .map((nome) => ({
          nome,
          valor: porGerente[nome].reduce((s, r) => s + (r.VALOR || 0), 0),
          ocorrencias: porGerente[nome].length,
        }))
        .sort((a, b) => b.valor - a.valor);

      const porSupervisor = Utils.groupBy(filtered, 'SUPERVISOR');
      const supervisorStats = Object.keys(porSupervisor)
        .filter((k) => k && k !== 'undefined')
        .map((nome) => ({ nome, valor: porSupervisor[nome].reduce((s, r) => s + (r.VALOR || 0), 0) }))
        .sort((a, b) => b.valor - a.valor);

      // Maior quebra individual registrada: um único lançamento (não acumulado por colaborador/loja).
      const maiorQuebraIndividual = filtered.reduce(
        (max, r) => ((r.VALOR || 0) > (max ? (max.VALOR || 0) : -Infinity) ? r : max),
        null
      );

      /* ------------------------------ KPIs ------------------------------ */
      const topColaborador = colaboradorStats[0];
      const topLojaQuebra = lojaStats[0];
      const topGerente = gerenteStats[0];
      const topSupervisor = supervisorStats[0];
      const mediaPorColaborador = colaboradorStats.length ? totalValor / colaboradorStats.length : 0;
      const mediaPorLoja = lojaStats.length ? totalValor / lojaStats.length : 0;

      Utils.emptyNode(kpiWrap);
      kpiWrap.appendChild(kpiGrid([
        { icon: 'coin', label: 'Total de quebras no período', value: Utils.formatCurrency(totalValor), loading },
        { icon: 'coin', label: 'Ocorrências', value: Utils.formatNumber(filtered.length), loading },
        {
          icon: 'coin',
          label: 'Colaborador com maior valor acumulado',
          value: topColaborador ? topColaborador.nome : '—',
          delta: topColaborador ? Utils.formatCurrency(topColaborador.valor) : '',
          loading,
        },
        {
          icon: 'scale',
          label: 'Loja com maior valor acumulado',
          value: topLojaQuebra ? topLojaQuebra.loja : '—',
          delta: topLojaQuebra ? Utils.formatCurrency(topLojaQuebra.valor) : '',
          loading,
        },
        {
          icon: 'scale',
          label: 'Gerente com maior valor acumulado',
          value: topGerente ? topGerente.nome : '—',
          delta: topGerente ? Utils.formatCurrency(topGerente.valor) : '',
          loading,
        },
        {
          icon: 'scale',
          label: 'Supervisor com maior valor acumulado',
          value: topSupervisor ? topSupervisor.nome : '—',
          delta: topSupervisor ? Utils.formatCurrency(topSupervisor.valor) : '',
          loading,
        },
        {
          icon: 'warning',
          label: 'Loja com maior quantidade de ocorrências',
          value: lojaMaisOcorrencias ? lojaMaisOcorrencias.loja : '—',
          delta: lojaMaisOcorrencias ? `${Utils.formatNumber(lojaMaisOcorrencias.ocorrencias)} ocorrência(s)` : '',
          loading,
        },
        {
          icon: 'warning',
          label: 'Maior quebra individual registrada',
          value: maiorQuebraIndividual ? Utils.formatCurrency(maiorQuebraIndividual.VALOR) : '—',
          delta: maiorQuebraIndividual ? `${maiorQuebraIndividual.COLABORADOR} · ${maiorQuebraIndividual.LOJA}` : '',
          loading,
        },
        { icon: 'trendUp', label: 'Média por colaborador', value: Utils.formatCurrency(mediaPorColaborador), loading },
        { icon: 'trendUp', label: 'Média por loja', value: Utils.formatCurrency(mediaPorLoja), loading },
      ]));

      /* ------------------------------ Gráficos: Tendências ------------------------------ */
      const porMes = Utils.groupBy(filtered, 'MES');
      const mesesOrdenados = mesesPresentes(filtered);

      // 1. Ranking das 10 lojas com maior valor de quebra (lojaStats já vem ordenado por valor).
      const lojasTop10 = lojaStats.slice(0, 10);

      // 3. Top 10 colaboradores por valor acumulado (colaboradorStats já vem ordenado por valor).
      const colaboradoresTop10 = colaboradorStats.slice(0, 10);

      // 4. Quantidade de ocorrências por gerente (reordenado por ocorrências, não por valor).
      const gerentesPorOcorrencias = [...gerenteStats].sort((a, b) => b.ocorrencias - a.ocorrencias).slice(0, 10);

      Utils.emptyNode(chartsWrap);
      chartsWrap.appendChild(realChartGrid([
        {
          title: 'Ranking das 10 lojas com maior valor de quebra',
          type: 'bar',
          data: {
            labels: lojasTop10.map((l) => l.loja),
            datasets: [{
              label: 'Valor (R$)',
              data: lojasTop10.map((l) => l.valor),
              backgroundColor: Charts.PALETTE[4],
            }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Evolução mensal das quebras',
          type: 'line',
          data: {
            labels: mesesOrdenados,
            datasets: [{
              label: 'Valor (R$)',
              data: mesesOrdenados.map((m) => (porMes[m] || []).reduce((s, r) => s + (r.VALOR || 0), 0)),
              borderColor: Charts.PALETTE[1],
              backgroundColor: Charts.PALETTE[1],
              tension: 0.3,
            }],
          },
          options: { plugins: { legend: { display: false } } },
        },
        {
          title: 'Top 10 colaboradores',
          type: 'bar',
          data: {
            labels: colaboradoresTop10.map((c) => c.nome),
            datasets: [{
              label: 'Valor acumulado (R$)',
              data: colaboradoresTop10.map((c) => c.valor),
              backgroundColor: Charts.PALETTE[2],
            }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Quantidade de ocorrências por gerente',
          type: 'bar',
          data: {
            labels: gerentesPorOcorrencias.map((g) => g.nome),
            datasets: [{
              label: 'Ocorrências',
              data: gerentesPorOcorrencias.map((g) => g.ocorrencias),
              backgroundColor: Charts.PALETTE[0],
            }],
          },
          options: { plugins: { legend: { display: false } } },
        },
      ]));

      /* ------------------------------ Rankings: Colaboradores, Lojas e Gerentes ------------------------------
         Reaproveita colaboradorStats / lojaStats / gerenteStats (já ordenados do
         maior para o menor valor total). Cada linha ganha a posição (1, 2, 3…)
         e o valor médio (valor total / ocorrências). */
      Utils.emptyNode(rankingColaboradoresWrap);
      rankingColaboradoresWrap.appendChild(dataTableCard({
        title: 'Ranking de colaboradores',
        columns: ['Posição', 'Colaborador', 'Ocorrências', 'Valor total', 'Valor médio'],
        rows: colaboradorStats,
        loading,
        mapRow: (r, i) => [
          td(i + 1), td(r.nome), td(Utils.formatNumber(r.ocorrencias)),
          td(Utils.formatCurrency(r.valor)), td(Utils.formatCurrency(r.valor / r.ocorrencias)),
        ],
      }));

      Utils.emptyNode(rankingLojasWrap);
      rankingLojasWrap.appendChild(dataTableCard({
        title: 'Ranking de lojas',
        columns: ['Posição', 'Loja', 'Ocorrências', 'Valor total', 'Valor médio'],
        rows: lojaStats,
        loading,
        mapRow: (r, i) => [
          td(i + 1), td(r.loja), td(Utils.formatNumber(r.ocorrencias)),
          td(Utils.formatCurrency(r.valor)), td(Utils.formatCurrency(r.valor / r.ocorrencias)),
        ],
      }));

      Utils.emptyNode(rankingGerentesWrap);
      rankingGerentesWrap.appendChild(dataTableCard({
        title: 'Ranking de gerentes',
        columns: ['Posição', 'Gerente', 'Ocorrências', 'Valor total', 'Valor médio'],
        rows: gerenteStats,
        loading,
        mapRow: (r, i) => [
          td(i + 1), td(r.nome), td(Utils.formatNumber(r.ocorrencias)),
          td(Utils.formatCurrency(r.valor)), td(Utils.formatCurrency(r.valor / r.ocorrencias)),
        ],
      }));

      /* ------------------------------ Tabela (ordenada por maior valor) ------------------------------ */
      Utils.emptyNode(tableWrap);
      tableWrap.appendChild(dataTableCard({
        title: 'Quebras de caixa',
        columns: ['Colaborador', 'Valor', 'Loja', 'Gerente', 'Supervisor', 'Mês'],
        rows: [...filtered].sort((a, b) => (b.VALOR || 0) - (a.VALOR || 0)),
        loading,
        mapRow: (r) => [
          td(r.COLABORADOR), td(Utils.formatCurrency(r.VALOR)), td(r.LOJA), td(r.GERENTE), td(r.SUPERVISOR), td(r.MES),
        ],
      }));
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(res.data, 'LOJA') },
      { key: 'GERENTE', label: 'Gerente', options: Utils.uniqueValues(res.data, 'GERENTE') },
      { key: 'SUPERVISOR', label: 'Supervisor', options: Utils.uniqueValues(res.data, 'SUPERVISOR') },
      { key: 'MES', label: 'Mês', options: mesesPresentes(res.data) },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => { persistFilterState('quebraCaixa', state); update(state); });

    if (filterStateByModule.quebraCaixa) filterApi.setState(filterStateByModule.quebraCaixa);
    update(filterApi.getState());
  }

  /**
   * Turnover — ver metodologia completa no comentário do bloco "5e" acima.
   * Reaproveita DATASETS.admissoes/desligamentos/lojas (já carregados pelo
   * Dashboard/Admissões/Desligamentos); não precisa de nenhuma aba nova nem
   * de mudança em googleSheets.js.
   */
  function renderTurnover(container) {
    const admissoesRes = DATASETS.admissoes;
    const desligamentosRes = DATASETS.desligamentos;
    const lojaFuncaoRes = DATASETS.lojaFuncao;
    const loading = !hasLoadedOnce;

    if (!loading) {
      if (!admissoesRes.ok) container.appendChild(errorBannerFor('admissoes', admissoesRes));
      if (!desligamentosRes.ok) container.appendChild(errorBannerFor('desligamentos', desligamentosRes));
      if (!lojaFuncaoRes.ok) container.appendChild(errorBannerFor('lojaFuncao', lojaFuncaoRes));
    }

    container.appendChild(alertBanner({
      title: 'Como o Turnover é calculado',
      message: 'Turnover = ((Admissões finalizadas + Desligamentos) / 2) / Headcount médio × 100. O Headcount médio mensal é reconstruído a partir do Headcount atual da ABA_LOJA_FUNCAO (fonte de verdade oficial para Headcount por loja e por função), recuando pelos eventos reais de admissão/desligamento registrados — nenhum valor histórico é presumido. Turnover por Função agora também é uma taxa real, não só contagem. Lojas sem nenhuma movimentação no período ficam fora dos agrupamentos por Gerente/Supervisor, por não terem responsável confirmado nos dados.',
      variant: 'warning',
    }));

    const admissoesAno = withAno(admissoesFinalizadas(admissoesRes.data));
    const desligamentosAno = withAno(desligamentosRes.data);
    const combinedForOptions = [...admissoesAno, ...desligamentosAno];
    const lojaResponsavelMap = buildLojaResponsavelMap(admissoesAno, desligamentosAno);

    // Fonte de verdade oficial (ABA_LOJA_FUNCAO) para Headcount por loja e por função.
    const headcountPorLoja = sumHeadcountLojaFuncaoBy(lojaFuncaoRes.data, 'LOJA');
    const headcountPorFuncao = sumHeadcountLojaFuncaoBy(lojaFuncaoRes.data, 'FUNCAO');

    const filterWrap = Utils.el('div');
    const kpiWrap = Utils.el('div');
    const chartsWrapEvolucao = Utils.el('div');
    const chartsWrapDistribuicao = Utils.el('div');
    const rankingWrap = Utils.el('div');
    const tableWrap = Utils.el('div');

    container.appendChild(filterWrap);
    container.appendChild(sectionHeader('Visão geral de Turnover', 'Calculado a partir das bases reais de Admissões, Desligamentos e Headcount por loja, considerando os filtros aplicados'));
    container.appendChild(kpiWrap);
    container.appendChild(sectionHeader('Evolução mensal'));
    container.appendChild(chartsWrapEvolucao);
    container.appendChild(sectionHeader('Distribuição', 'Turnover por loja/gerente/supervisor é uma taxa real (usa Headcount); por função é contagem de movimentações (sem Headcount por função na planilha)'));
    container.appendChild(chartsWrapDistribuicao);
    container.appendChild(sectionHeader('Rankings', 'Lojas, gerentes e supervisores ordenados pela maior taxa de Turnover no período filtrado'));
    container.appendChild(rankingWrap);
    container.appendChild(sectionHeader('Tabela analítica por loja'));
    container.appendChild(tableWrap);

    function update(state) {
      const { busca, MES: mesFiltro, ANO: anoFiltro, ...groupFilters } = state;
      const BUSCA_FIELDS = ['COLABORADOR', 'COLABORADOR_ABREVIADO'];

      // Filtrado só por Loja/Gerente/Supervisor/Função/busca (sem Mês/Ano) — é a
      // base usada para reconstruir o Headcount histórico, que precisa do
      // histórico completo pra retroceder corretamente mês a mês.
      const admissoesGroup = Utils.filterByBusca(Filters.applyFilters(admissoesAno, groupFilters), busca, BUSCA_FIELDS);
      const desligamentosGroup = Utils.filterByBusca(Filters.applyFilters(desligamentosAno, groupFilters), busca, BUSCA_FIELDS);

      // Mesma coisa, já recortada por Mês/Ano — usada só para exibir contagens do período selecionado.
      const dentroDoPeriodo = (r) => (!mesFiltro || r.MES === mesFiltro) && (!anoFiltro || r.ANO === anoFiltro);
      const admissoesExibicao = admissoesGroup.filter(dentroDoPeriodo);
      const desligamentosExibicao = desligamentosGroup.filter(dentroDoPeriodo);

      const periodFilter = (mesFiltro || anoFiltro) ? { MES: mesFiltro, ANO: anoFiltro } : null;

      // Fonte de verdade: ABA_LOJA_FUNCAO — sempre retorna um número (Função já tem Headcount próprio agora).
      const headcountAtualFiltrado = headcountFromLojaFuncao(groupFilters, lojaResponsavelMap, lojaFuncaoRes.data);

      const geralAgg = aggregateGroupTurnover(admissoesGroup, desligamentosGroup, headcountAtualFiltrado, periodFilter);
      // Evolução mensal sempre mostra a tendência completa, independente do filtro de Mês (só o KPI/tabela recorta).
      const geralSeriesCompleta = reconstructMonthlySeries(admissoesGroup, desligamentosGroup, headcountAtualFiltrado);

      const saldo = admissoesExibicao.length - desligamentosExibicao.length;

      /* ------------------------------ KPIs ------------------------------ */
      Utils.emptyNode(kpiWrap);
      kpiWrap.appendChild(kpiGrid([
        {
          icon: 'turnover', label: 'Turnover no período',
          value: geralAgg.turnoverPct !== null ? Utils.formatPercent(geralAgg.turnoverPct) : '—',
          loading,
        },
        { icon: 'admissoes', label: 'Admissões finalizadas', value: Utils.formatNumber(admissoesExibicao.length), loading },
        { icon: 'desligamentos', label: 'Desligamentos', value: Utils.formatNumber(desligamentosExibicao.length), loading },
        {
          icon: 'dashboard', label: 'Saldo de colaboradores',
          value: (saldo > 0 ? '+' : '') + Utils.formatNumber(saldo),
          deltaDirection: saldo < 0 ? 'down' : (saldo > 0 ? 'up' : undefined),
          loading,
        },
        {
          icon: 'admissoes', label: 'Headcount atual (filtro)',
          value: Utils.formatNumber(headcountAtualFiltrado),
          loading,
        },
        {
          icon: 'bancoHoras', label: 'Headcount médio (período)',
          value: (geralAgg && geralAgg.headcountMedioPeriodo != null) ? Utils.formatNumber(Math.round(geralAgg.headcountMedioPeriodo)) : '—',
          loading,
        },
      ]));

      /* ------------------------------ Evolução mensal ------------------------------ */
      Utils.emptyNode(chartsWrapEvolucao);
      if (!geralSeriesCompleta.length) {
        chartsWrapEvolucao.appendChild(Utils.el('p', {
          class: 'view__section-desc',
          text: 'Sem movimentações no período/filtro selecionado para montar a evolução mensal.',
        }));
      } else {
        const mesesOrdenados = geralSeriesCompleta.map((m) => m.mes);
        chartsWrapEvolucao.appendChild(realChartGrid([
          {
            title: 'Evolução mensal do Turnover (%)',
            type: 'line',
            data: {
              labels: mesesOrdenados,
              datasets: [{
                label: 'Turnover (%)',
                data: geralSeriesCompleta.map((m) => (m.turnoverPct === null ? 0 : Number(m.turnoverPct.toFixed(2)))),
                borderColor: Charts.PALETTE[0], backgroundColor: Charts.PALETTE[0], tension: 0.3,
              }],
            },
            options: { plugins: { legend: { display: false } } },
          },
          {
            title: 'Admissões x Desligamentos por mês',
            type: 'bar',
            data: {
              labels: mesesOrdenados,
              datasets: [
                { label: 'Admissões', data: geralSeriesCompleta.map((m) => m.admissoes), backgroundColor: Charts.PALETTE[2] },
                { label: 'Desligamentos', data: geralSeriesCompleta.map((m) => m.desligamentos), backgroundColor: Charts.PALETTE[3] },
              ],
            },
          },
        ]));
      }

      /* ------------------------------ Distribuição ------------------------------ */
      const lojaStatsTurnover = groupTurnoverStats(admissoesGroup, desligamentosGroup, 'LOJA', headcountPorLoja, periodFilter);

      const headcountPorGerente = {};
      const headcountPorSupervisor = {};
      Object.keys(lojaResponsavelMap).forEach((loja) => {
        const { gerente, supervisor } = lojaResponsavelMap[loja];
        const hc = headcountPorLoja[loja] || 0;
        headcountPorGerente[gerente] = (headcountPorGerente[gerente] || 0) + hc;
        headcountPorSupervisor[supervisor] = (headcountPorSupervisor[supervisor] || 0) + hc;
      });
      const gerenteStatsTurnover = groupTurnoverStats(admissoesGroup, desligamentosGroup, 'GERENTE', headcountPorGerente, periodFilter);
      const supervisorStatsTurnover = groupTurnoverStats(admissoesGroup, desligamentosGroup, 'SUPERVISOR', headcountPorSupervisor, periodFilter);
      // Função agora tem Headcount próprio (ABA_LOJA_FUNCAO) — mesma taxa real de loja/gerente/supervisor, não mais contagem.
      const funcaoStatsTurnover = groupTurnoverStats(admissoesGroup, desligamentosGroup, 'FUNCAO', headcountPorFuncao, periodFilter);

      Utils.emptyNode(chartsWrapDistribuicao);
      chartsWrapDistribuicao.appendChild(realChartGrid([
        {
          title: 'Turnover por loja (%)',
          type: 'bar',
          data: {
            labels: lojaStatsTurnover.filter((s) => s.turnoverPct !== null).slice(0, 10).map((s) => s.key),
            datasets: [{ label: 'Turnover (%)', data: lojaStatsTurnover.filter((s) => s.turnoverPct !== null).slice(0, 10).map((s) => Number(s.turnoverPct.toFixed(2))), backgroundColor: Charts.PALETTE[0] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Turnover por gerente (%)',
          type: 'bar',
          data: {
            labels: gerenteStatsTurnover.filter((s) => s.turnoverPct !== null).slice(0, 10).map((s) => s.key),
            datasets: [{ label: 'Turnover (%)', data: gerenteStatsTurnover.filter((s) => s.turnoverPct !== null).slice(0, 10).map((s) => Number(s.turnoverPct.toFixed(2))), backgroundColor: Charts.PALETTE[1] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Turnover por supervisor (%)',
          type: 'bar',
          data: {
            labels: supervisorStatsTurnover.filter((s) => s.turnoverPct !== null).slice(0, 10).map((s) => s.key),
            datasets: [{ label: 'Turnover (%)', data: supervisorStatsTurnover.filter((s) => s.turnoverPct !== null).slice(0, 10).map((s) => Number(s.turnoverPct.toFixed(2))), backgroundColor: Charts.PALETTE[4] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Turnover por função (%)',
          type: 'bar',
          data: {
            labels: funcaoStatsTurnover.filter((s) => s.turnoverPct !== null).slice(0, 10).map((s) => s.key),
            datasets: [{ label: 'Turnover (%)', data: funcaoStatsTurnover.filter((s) => s.turnoverPct !== null).slice(0, 10).map((s) => Number(s.turnoverPct.toFixed(2))), backgroundColor: Charts.PALETTE[2] }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
      ]));

      /* ------------------------------ Rankings ------------------------------ */
      Utils.emptyNode(rankingWrap);
      rankingWrap.appendChild(rankingGrid([
        turnoverRankingCard({ title: 'Ranking de Turnover por loja', items: lojaStatsTurnover }),
        turnoverRankingCard({ title: 'Ranking de Turnover por gerente', items: gerenteStatsTurnover }),
        turnoverRankingCard({ title: 'Ranking de Turnover por supervisor', items: supervisorStatsTurnover }),
        turnoverRankingCard({ title: 'Ranking de Turnover por função', items: funcaoStatsTurnover }),
      ]));

      /* ------------------------------ Tabela analítica ------------------------------ */
      Utils.emptyNode(tableWrap);
      tableWrap.appendChild(dataTableCard({
        title: 'Turnover por loja',
        columns: ['Loja', 'Headcount', 'Admissões', 'Desligamentos', 'Turnover'],
        rows: lojaStatsTurnover,
        loading,
        mapRow: (r) => [
          td(r.key),
          td(Utils.formatNumber(r.headcountAtual)),
          td(Utils.formatNumber(r.admissoes)),
          td(Utils.formatNumber(r.desligamentos)),
          td(r.turnoverPct === null ? '—' : Utils.formatPercent(r.turnoverPct)),
        ],
      }));
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'ANO', label: 'Ano', options: Utils.uniqueValues(combinedForOptions, 'ANO') },
      { key: 'MES', label: 'Mês', options: mesesPresentes(combinedForOptions) },
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(lojaFuncaoRes.data.length ? lojaFuncaoRes.data : combinedForOptions, 'LOJA') },
      { key: 'GERENTE', label: 'Gerente', options: Utils.uniqueValues(combinedForOptions, 'GERENTE') },
      { key: 'SUPERVISOR', label: 'Supervisor', options: Utils.uniqueValues(combinedForOptions, 'SUPERVISOR') },
      { key: 'FUNCAO', label: 'Função', options: Utils.uniqueValues(lojaFuncaoRes.data.length ? lojaFuncaoRes.data : combinedForOptions, 'FUNCAO') },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => { persistFilterState('turnover', state); update(state); });

    if (filterStateByModule.turnover) filterApi.setState(filterStateByModule.turnover);
    update(filterApi.getState());
  }


  /* --------------------------------------------------------------------
   * 5f. HELPERS E RENDER DO MÓDULO DE ABSENTEÍSMO
   * ------------------------------------------------------------------
   * Fonte única: DATASETS.absenteismo (BASE_ABS) — um registro por dia de
   * ausência, com STATUS "ATESTADO" ou "FALTA". Regra de negócio desta etapa:
   *   TOTAL ABS = ATESTADO + FALTA (contagem de linhas, sem identificação de
   *   documentos individuais de atestado e sem cruzamento com saldo negativo
   *   do Banco de Horas — ambos ficam para uma etapa futura).
   * A BASE_ABS não tem colunas MES/ANO próprias (só a data real "DT"), por
   * isso o período é derivado aqui (mesmo padrão já usado em PREVISAO_MES,
   * no módulo de Férias) em vez de alterar o parser genérico em googleSheets.js.
   * ------------------------------------------------------------------ */

  /**
   * Deriva DT_MES (abreviação, ex: "JAN") e DT_ANO (string) a partir da coluna
   * DT, para alimentar os filtros de período (reaproveita Filters/mesesPresentes,
   * sem criar um sistema de filtros paralelo). Também normaliza STATUS e
   * COLABORADOR (maiúsculas/sem espaços) por segurança contra variações de
   * digitação na planilha de origem — auditoria da Etapa 2 encontrou 2 nomes
   * gravados com grafias de caixa diferentes na mesma loja (ex.: "ALANA S."
   * e "Alana S."), o que fazia o dashboard contar o mesmo colaborador duas
   * vezes (KPI "Colaboradores com ocorrência" e ranking de Ofensores).
   * Note que isso NÃO afeta os casos legítimos de dois colaboradores
   * diferentes com o mesmo nome em lojas distintas (ex.: "ANA L." nas lojas
   * 13 e 24) — esses continuam corretamente separados pela combinação
   * COLABORADOR+LOJA em agruparAbsPorColaborador.
   */
  function withAbsPeriodo(list) {
    return list.map((r) => ({
      ...r,
      DT_MES: r.DT ? MESES_ORDER[r.DT.getMonth()] : '',
      DT_ANO: r.DT ? String(r.DT.getFullYear()) : '',
      STATUS: String(r.STATUS || '').trim().toUpperCase(),
      COLABORADOR: String(r.COLABORADOR || '').trim().toUpperCase(),
    }));
  }

  /**
   * Agrupa os registros de Absenteísmo por COLABORADOR, combinado com LOJA
   * (mesmo cuidado contra homônimos já adotado em calcularSequenciasAtuais,
   * no módulo de Banco de Horas), contando FALTAS/ATESTADOS/TOTAL ABS.
   * Mantém LOJA/GERENTE/SUPERVISOR do registro mais recente do colaborador,
   * para a tabela de "Ofensores" exibir o contexto completo.
   */
  function agruparAbsPorColaborador(registros, saldoLookup) {
    const porColaborador = registros.reduce((acc, item) => {
      const groupKey = `${item.COLABORADOR}||${item.LOJA}`;
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(item);
      return acc;
    }, {});

    return Object.keys(porColaborador).map((groupKey) => {
      const grupo = porColaborador[groupKey];
      const ultimo = grupo[grupo.length - 1];
      const faltas = grupo.filter((r) => r.STATUS === 'FALTA').length;
      const atestados = grupo.filter((r) => r.STATUS === 'ATESTADO').length;
      // saldoLookup é opcional (chave COLABORADOR+LOJA, ver buildSaldoLookup) —
      // quando não há correspondência (ou o parâmetro não é passado), saldo
      // fica null e a apresentação mostra "sem saldo correspondente" (—),
      // nunca um valor de outra loja/colaborador (ver REGRA DE SEGURANÇA, Etapa 4).
      const saldo = saldoLookup && saldoLookup.has(groupKey) ? saldoLookup.get(groupKey) : null;
      return {
        key: ultimo.COLABORADOR,
        COLABORADOR: ultimo.COLABORADOR,
        LOJA: ultimo.LOJA,
        SUPERVISOR: ultimo.SUPERVISOR,
        GERENTE: ultimo.GERENTE,
        faltas,
        atestados,
        total: faltas + atestados,
        saldo,
      };
    });
  }

  /**
   * Monta o índice de saldo (BASE_SALDO_TOTAL) por COLABORADOR+LOJA, na mesma
   * chave usada por agruparAbsPorColaborador. COLABORADOR é normalizado aqui
   * (maiúsculas/trim) da mesma forma que withAbsPeriodo já normaliza o lado da
   * BASE_ABS — sem alterar DATASETS.saldoTotal.data nem googleSheets.js. LOJA já
   * vem normalizada por _normalizeLoja (googleSheets.js) nas duas bases.
   *
   * Chave de cruzamento validada na Etapa 3A: COLABORADOR (trim + maiúsculas,
   * sem remoção de acento) + LOJA. Não faz correspondência aproximada/fuzzy e
   * não usa COLABORADOR isolado como fallback (ver exceção ANDREA G. abaixo).
   *
   * Segurança: se a mesma chave aparecer mais de uma vez em BASE_SALDO_TOTAL
   * (não deveria — 293 linhas = 293 chaves distintas, validado na Etapa 3A),
   * a chave é removida do índice em vez de escolher um valor arbitrariamente,
   * para nunca arriscar associar o saldo de outra pessoa.
   */
  function buildSaldoLookup(saldoTotalData) {
    const counts = new Map();
    const map = new Map();
    saldoTotalData.forEach((r) => {
      const colaborador = String(r.COLABORADOR || '').trim().toUpperCase();
      const key = `${colaborador}||${r.LOJA}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      map.set(key, r.BANCO_TOTAL);
    });
    counts.forEach((count, key) => { if (count > 1) map.delete(key); });
    return map;
  }

  /**
   * Agrega, a partir dos colaboradores já agrupados por agruparAbsPorColaborador
   * (um por COLABORADOR+LOJA, já com `saldo` anexado), a quantidade de
   * colaboradores com saldo negativo e o total do déficit, por LOJA/SUPERVISOR/
   * GERENTE. Usa a lista por colaborador (não os registros brutos por dia de
   * groupAbsStats) para não contar o mesmo saldo mais de uma vez por dia de
   * ausência.
   */
  function groupSaldoNegativoStats(porColaborador, key) {
    const map = new Map();
    porColaborador.forEach((c) => {
      const k = c[key];
      if (!k) return;
      if (!map.has(k)) map.set(k, { colaboradoresComSaldoNegativo: 0, saldoNegativoTotal: 0 });
      if (c.saldo !== null && c.saldo < 0) {
        const entry = map.get(k);
        entry.colaboradoresComSaldoNegativo += 1;
        entry.saldoNegativoTotal += c.saldo;
      }
    });
    return map;
  }

  /**
   * Agrupa os registros de Absenteísmo por um campo simples (LOJA, GERENTE ou
   * SUPERVISOR), contando FALTAS/ATESTADOS/TOTAL ABS — usado nos gráficos,
   * rankings e tabelas analíticas de "Por loja"/"Por gerente"/"Por supervisor".
   * Ordenado do maior para o menor TOTAL ABS.
   */
  function groupAbsStats(registros, key) {
    const map = new Map();
    registros.forEach((r) => {
      const k = r[key];
      if (!k) return;
      if (!map.has(k)) map.set(k, { key: k, faltas: 0, atestados: 0 });
      if (r.STATUS === 'FALTA') map.get(k).faltas += 1;
      else if (r.STATUS === 'ATESTADO') map.get(k).atestados += 1;
    });
    return Array.from(map.values())
      .map((item) => ({ ...item, total: item.faltas + item.atestados }))
      .sort((a, b) => b.total - a.total);
  }

  /** Card de ranking do módulo de Absenteísmo — mesmo padrão visual (ranking-card/ranking-list) dos demais rankings, ordenado pela métrica escolhida ('faltas' | 'atestados' | 'total'). */
  function absRankingCard({ title, items, metric, emptyText = 'Nenhum dado no período selecionado.' }) {
    const card = Utils.el('div', { class: 'ranking-card' });
    card.appendChild(Utils.el('div', { class: 'ranking-card__header' }, [
      Utils.el('h3', { class: 'ranking-card__title', text: title }),
    ]));

    const ordenado = items.filter((i) => i[metric] > 0).sort((a, b) => b[metric] - a[metric]).slice(0, 8);
    const list = Utils.el('div', { class: 'ranking-list' });
    if (!ordenado.length) {
      list.appendChild(Utils.el('p', { class: 'ranking-empty', text: emptyText }));
    } else {
      const max = Math.max(...ordenado.map((i) => i[metric]), 1);
      const metricLabel = metric === 'faltas' ? 'falta' : metric === 'atestados' ? 'atestado' : 'ocorrência';
      ordenado.forEach((item, idx) => {
        const valor = item[metric];
        const pct = Math.max(4, Math.round((valor / max) * 100));
        list.appendChild(Utils.el('div', { class: 'ranking-item' }, [
          Utils.el('span', { class: `ranking-item__pos${idx < 3 ? ' ranking-item__pos--top' : ''}`, text: String(idx + 1) }),
          Utils.el('div', { class: 'ranking-item__body' }, [
            Utils.el('div', { class: 'ranking-item__top' }, [
              Utils.el('span', { class: 'ranking-item__name', text: item.key }),
              Utils.el('span', { class: 'ranking-item__count', text: `${Utils.formatNumber(valor)} ${metricLabel}${valor === 1 ? '' : 's'}` }),
            ]),
            Utils.el('div', { class: 'ranking-item__bar' }, [
              Utils.el('div', { class: 'ranking-item__bar-fill', style: `width:${pct}%` }),
            ]),
            Utils.el('div', { class: 'ranking-item__meta' }, [
              Utils.el('span', { text: `Faltas: ${Utils.formatNumber(item.faltas)}` }),
              Utils.el('span', { text: `Atestados: ${Utils.formatNumber(item.atestados)}` }),
              Utils.el('span', { text: `Total ABS: ${Utils.formatNumber(item.total)}` }),
            ]),
          ]),
        ]));
      });
    }
    card.appendChild(list);
    return card;
  }

  function renderAbsenteismo(container) {
    const res = DATASETS.absenteismo;
    const saldoTotalRes = DATASETS.saldoTotal;
    const loading = !hasLoadedOnce;
    if (!loading) {
      if (!res.ok) container.appendChild(errorBannerFor('absenteismo', res));
      if (!saldoTotalRes.ok) container.appendChild(errorBannerFor('saldoTotal', saldoTotalRes));
    }

    container.appendChild(alertBanner({
      title: 'Como o Absenteísmo e o Saldo são calculados',
      message: 'ATESTADO e FALTA são contados a partir da coluna STATUS da BASE_ABS — cada linha representa um dia de ausência. TOTAL ABS = ATESTADO + FALTA. O SALDO vem da base de Saldo Total do Banco de Horas (fonte de verdade do saldo atual), cruzado por COLABORADOR+LOJA — nunca por nome isolado. Quando não há correspondência exata das duas bases, o colaborador aparece como "sem saldo correspondente" em vez de receber o saldo de outra pessoa/loja. O saldo representa o total atual do colaborador, não é filtrado pelo período selecionado (que continua afetando só as ocorrências de ABS).',
      variant: 'warning',
    }));

    const processadas = withAbsPeriodo(res.data);
    const saldoLookup = buildSaldoLookup(saldoTotalRes.data);

    const filterWrap = Utils.el('div');
    const kpiWrap = Utils.el('div');
    const rankingWrap = Utils.el('div');
    const ofensoresTableWrap = Utils.el('div');
    const ofensoresSaldoTableWrap = Utils.el('div');
    const chartsWrap = Utils.el('div');
    const lojaTableWrap = Utils.el('div');
    const supervisorTableWrap = Utils.el('div');
    const gerenteTableWrap = Utils.el('div');
    const historicoTableWrap = Utils.el('div');

    container.appendChild(filterWrap);
    container.appendChild(sectionHeader('Visão geral de Absenteísmo', 'Atestados e faltas registrados na BASE_ABS, considerando os filtros aplicados'));
    container.appendChild(kpiWrap);
    container.appendChild(sectionHeader('Ofensores', 'Colaboradores com maior número de faltas, atestados e total de absenteísmo no período filtrado'));
    container.appendChild(rankingWrap);
    container.appendChild(ofensoresTableWrap);
    container.appendChild(sectionHeader('Ofensores de saldo negativo', 'Colaboradores com ocorrência de absenteísmo no período E saldo de banco de horas negativo (BASE_SALDO_TOTAL), ordenados do maior para o menor déficit'));
    container.appendChild(ofensoresSaldoTableWrap);
    container.appendChild(sectionHeader('Distribuição', 'Faltas e atestados por loja, gerente e supervisor'));
    container.appendChild(chartsWrap);
    container.appendChild(sectionHeader('Por loja'));
    container.appendChild(lojaTableWrap);
    container.appendChild(sectionHeader('Por supervisor'));
    container.appendChild(supervisorTableWrap);
    container.appendChild(sectionHeader('Por gerente'));
    container.appendChild(gerenteTableWrap);
    container.appendChild(sectionHeader('Histórico de ocorrências', 'Todos os registros de ausência (atestado/falta) no período/filtro selecionado, por colaborador'));
    container.appendChild(historicoTableWrap);

    function update(state) {
      const { busca, ANO: anoFiltro, MES: mesFiltro, ...groupFilters } = state;
      const filteredGroup = Filters.applyFilters(processadas, groupFilters);
      const dentroDoPeriodo = (r) => (!mesFiltro || r.DT_MES === mesFiltro) && (!anoFiltro || r.DT_ANO === anoFiltro);
      const filtered = Utils.filterByBusca(filteredGroup.filter(dentroDoPeriodo), busca, ['COLABORADOR']);

      /* ------------------------------ KPIs ------------------------------ */
      const totalAtestados = filtered.filter((r) => r.STATUS === 'ATESTADO').length;
      const totalFaltas = filtered.filter((r) => r.STATUS === 'FALTA').length;
      const totalAbs = totalAtestados + totalFaltas;
      const colaboradoresDistintos = Utils.uniqueValues(filtered, 'COLABORADOR').length;

      /* ------------------------------ Ofensores ------------------------------ */
      const porColaborador = agruparAbsPorColaborador(filtered, saldoLookup);
      const ofensoresSaldoNegativo = porColaborador
        .filter((c) => c.saldo !== null && c.saldo < 0)
        .sort((a, b) => a.saldo - b.saldo); // mais negativo primeiro (nunca por valor absoluto)
      const totalSaldoNegativo = ofensoresSaldoNegativo.reduce((sum, c) => sum + c.saldo, 0);

      Utils.emptyNode(kpiWrap);
      kpiWrap.appendChild(kpiGrid([
        { icon: 'absenteismo', label: 'Total de atestados', value: Utils.formatNumber(totalAtestados), loading },
        { icon: 'warning', label: 'Total de faltas', value: Utils.formatNumber(totalFaltas), loading },
        { icon: 'dashboard', label: 'Total ABS', value: Utils.formatNumber(totalAbs), loading },
        { icon: 'admissoes', label: 'Colaboradores com ocorrência', value: Utils.formatNumber(colaboradoresDistintos), loading },
        { icon: 'trendDown', label: 'Colaboradores com saldo negativo', value: Utils.formatNumber(ofensoresSaldoNegativo.length), loading },
        { icon: 'scale', label: 'Total de saldo negativo', value: Utils.formatHoras(totalSaldoNegativo), loading },
      ]));

      Utils.emptyNode(rankingWrap);
      rankingWrap.appendChild(rankingGrid([
        absRankingCard({ title: 'Ranking de Faltas', items: porColaborador, metric: 'faltas' }),
        absRankingCard({ title: 'Ranking de Atestados', items: porColaborador, metric: 'atestados' }),
        absRankingCard({ title: 'Ranking de Total ABS', items: porColaborador, metric: 'total' }),
      ]));

      Utils.emptyNode(ofensoresTableWrap);
      ofensoresTableWrap.appendChild(dataTableCard({
        title: 'Ofensores — Colaboradores',
        columns: ['Colaborador', 'Loja', 'Supervisor', 'Gerente', 'Faltas', 'Atestados', 'Total ABS', 'Saldo'],
        rows: [...porColaborador].sort((a, b) => b.total - a.total),
        loading,
        mapRow: (r) => [
          td(r.COLABORADOR), td(r.LOJA), td(r.SUPERVISOR), td(r.GERENTE),
          td(Utils.formatNumber(r.faltas)), td(Utils.formatNumber(r.atestados)), td(Utils.formatNumber(r.total)),
          td(Utils.formatHoras(r.saldo)),
        ],
      }));

      /* ------------------------------ Ofensores de saldo negativo ------------------------------
       * Cruzamento COLABORADOR+LOJA com a BASE_SALDO_TOTAL (ver buildSaldoLookup) — só entra aqui
       * quem tem saldo < 0 E ao menos uma ocorrência de ABS no período/filtro selecionado. Ordenado
       * do maior para o menor déficit (mais negativo primeiro). */
      Utils.emptyNode(ofensoresSaldoTableWrap);
      ofensoresSaldoTableWrap.appendChild(dataTableCard({
        title: 'Ofensores de Saldo Negativo',
        columns: ['Colaborador', 'Loja', 'Supervisor', 'Gerente', 'Faltas', 'Atestados', 'Total ABS', 'Saldo'],
        rows: ofensoresSaldoNegativo,
        loading,
        mapRow: (r) => [
          td(r.COLABORADOR), td(r.LOJA), td(r.SUPERVISOR), td(r.GERENTE),
          td(Utils.formatNumber(r.faltas)), td(Utils.formatNumber(r.atestados)), td(Utils.formatNumber(r.total)),
          td(Utils.formatHoras(r.saldo)),
        ],
      }));

      /* ------------------------------ Distribuição ------------------------------ */
      const lojaStats = groupAbsStats(filtered, 'LOJA');
      const supervisorStats = groupAbsStats(filtered, 'SUPERVISOR');
      const gerenteStats = groupAbsStats(filtered, 'GERENTE');
      const saldoPorLoja = groupSaldoNegativoStats(porColaborador, 'LOJA');
      const saldoPorSupervisor = groupSaldoNegativoStats(porColaborador, 'SUPERVISOR');
      const saldoPorGerente = groupSaldoNegativoStats(porColaborador, 'GERENTE');

      Utils.emptyNode(chartsWrap);
      chartsWrap.appendChild(realChartGrid([
        {
          title: 'Faltas x Atestados por loja',
          type: 'bar',
          data: {
            labels: lojaStats.slice(0, 10).map((s) => s.key),
            datasets: [
              { label: 'Faltas', data: lojaStats.slice(0, 10).map((s) => s.faltas), backgroundColor: Charts.PALETTE[3] },
              { label: 'Atestados', data: lojaStats.slice(0, 10).map((s) => s.atestados), backgroundColor: Charts.PALETTE[0] },
            ],
          },
          options: { indexAxis: 'y' },
        },
        {
          title: 'Faltas x Atestados por supervisor',
          type: 'bar',
          data: {
            labels: supervisorStats.slice(0, 10).map((s) => s.key),
            datasets: [
              { label: 'Faltas', data: supervisorStats.slice(0, 10).map((s) => s.faltas), backgroundColor: Charts.PALETTE[3] },
              { label: 'Atestados', data: supervisorStats.slice(0, 10).map((s) => s.atestados), backgroundColor: Charts.PALETTE[0] },
            ],
          },
          options: { indexAxis: 'y' },
        },
        {
          title: 'Faltas x Atestados por gerente',
          type: 'bar',
          data: {
            labels: gerenteStats.slice(0, 10).map((s) => s.key),
            datasets: [
              { label: 'Faltas', data: gerenteStats.slice(0, 10).map((s) => s.faltas), backgroundColor: Charts.PALETTE[3] },
              { label: 'Atestados', data: gerenteStats.slice(0, 10).map((s) => s.atestados), backgroundColor: Charts.PALETTE[0] },
            ],
          },
          options: { indexAxis: 'y' },
        },
      ]));

      // Colunas de saldo negativo (Colaboradores c/ saldo negativo / Saldo negativo total) são
      // derivadas de porColaborador (um por COLABORADOR+LOJA), não dos registros brutos por dia
      // usados em lojaStats/supervisorStats/gerenteStats — ver groupSaldoNegativoStats.
      Utils.emptyNode(lojaTableWrap);
      lojaTableWrap.appendChild(dataTableCard({
        title: 'Absenteísmo por loja',
        columns: ['Loja', 'Faltas', 'Atestados', 'Total ABS', 'Colaboradores c/ saldo negativo', 'Saldo negativo total'],
        rows: lojaStats,
        loading,
        mapRow: (r) => {
          const s = saldoPorLoja.get(r.key) || { colaboradoresComSaldoNegativo: 0, saldoNegativoTotal: 0 };
          return [
            td(r.key), td(Utils.formatNumber(r.faltas)), td(Utils.formatNumber(r.atestados)), td(Utils.formatNumber(r.total)),
            td(Utils.formatNumber(s.colaboradoresComSaldoNegativo)), td(Utils.formatHoras(s.saldoNegativoTotal)),
          ];
        },
      }));

      Utils.emptyNode(supervisorTableWrap);
      supervisorTableWrap.appendChild(dataTableCard({
        title: 'Absenteísmo por supervisor',
        columns: ['Supervisor', 'Faltas', 'Atestados', 'Total ABS', 'Colaboradores c/ saldo negativo', 'Saldo negativo total'],
        rows: supervisorStats,
        loading,
        mapRow: (r) => {
          const s = saldoPorSupervisor.get(r.key) || { colaboradoresComSaldoNegativo: 0, saldoNegativoTotal: 0 };
          return [
            td(r.key), td(Utils.formatNumber(r.faltas)), td(Utils.formatNumber(r.atestados)), td(Utils.formatNumber(r.total)),
            td(Utils.formatNumber(s.colaboradoresComSaldoNegativo)), td(Utils.formatHoras(s.saldoNegativoTotal)),
          ];
        },
      }));

      Utils.emptyNode(gerenteTableWrap);
      gerenteTableWrap.appendChild(dataTableCard({
        title: 'Absenteísmo por gerente',
        columns: ['Gerente', 'Faltas', 'Atestados', 'Total ABS', 'Colaboradores c/ saldo negativo', 'Saldo negativo total'],
        rows: gerenteStats,
        loading,
        mapRow: (r) => {
          const s = saldoPorGerente.get(r.key) || { colaboradoresComSaldoNegativo: 0, saldoNegativoTotal: 0 };
          return [
            td(r.key), td(Utils.formatNumber(r.faltas)), td(Utils.formatNumber(r.atestados)), td(Utils.formatNumber(r.total)),
            td(Utils.formatNumber(s.colaboradoresComSaldoNegativo)), td(Utils.formatHoras(s.saldoNegativoTotal)),
          ];
        },
      }));

      /* ------------------------------ Histórico por colaborador ------------------------------ */
      Utils.emptyNode(historicoTableWrap);
      historicoTableWrap.appendChild(dataTableCard({
        title: 'Histórico de ocorrências',
        columns: ['Colaborador', 'Data', 'Dia', 'Status', 'Loja', 'Gerente', 'Supervisor'],
        rows: sortByDateDesc(filtered.map((r) => ({ ...r, DATA: r.DT }))),
        loading,
        maxRows: 300,
        mapRow: (r) => [
          td(r.COLABORADOR), td(Utils.formatDate(r.DT)), td(r.DIA),
          tdTag(r.STATUS, r.STATUS === 'FALTA' ? 'danger' : 'warning'),
          td(r.LOJA), td(r.GERENTE), td(r.SUPERVISOR),
        ],
      }));
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'ANO', label: 'Ano', options: Utils.uniqueValues(processadas, 'DT_ANO') },
      { key: 'MES', label: 'Mês', options: mesesPresentes(processadas, 'DT_MES') },
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(processadas, 'LOJA') },
      { key: 'GERENTE', label: 'Gerente', options: Utils.uniqueValues(processadas, 'GERENTE') },
      { key: 'SUPERVISOR', label: 'Supervisor', options: Utils.uniqueValues(processadas, 'SUPERVISOR') },
      { key: 'STATUS', label: 'Status', options: Utils.uniqueValues(processadas, 'STATUS') },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => { persistFilterState('absenteismo', state); update(state); });

    if (filterStateByModule.absenteismo) filterApi.setState(filterStateByModule.absenteismo);
    update(filterApi.getState());
  }


  /* --------------------------------------------------------------------
   * 5g. HELPERS E RENDER DO MÓDULO DE BANCO DE HORAS
   * ------------------------------------------------------------------
   * Duas bases distintas (ver googleSheets.js):
   *   - saldoTotal: FONTE DE VERDADE do saldo ATUAL por colaborador
   *     (COLABORADOR/FUNCAO/LOJA/BANCO_TOTAL). É o que alimenta os KPIs,
   *     gráficos e o ranking de saldo — nunca somar saldoDia para chegar
   *     nesse número.
   *   - saldoDia: detalhamento/movimentação diária (inclui DT, DIA,
   *     TOTAL_NORMAIS, STATUS) — usada só na tabela de movimentação.
   * Os valores de horas chegam já como Number decimal (ver
   * _parseHorasDecimais em googleSheets.js) e só viram "HH:MM" na
   * apresentação (Utils.formatHoras) — os cálculos usam sempre o decimal.
   * ------------------------------------------------------------------ */

  /**
   * Calcula, para cada colaborador, a sequência ATUAL de dias consecutivos
   * com STATUS === 'TRABALHADO', terminando no registro cronologicamente
   * mais recente daquele colaborador.
   *
   * IMPORTANTE: deve sempre receber a base COMPLETA de saldoDia (todos os
   * STATUS), nunca uma lista já filtrada por STATUS — do contrário, dias de
   * quebra (FOLGA/FÉRIAS/FALTA/DSR) somem da lista e a sequência fica errada.
   *
   * Regras:
   *  - Ordena os registros do colaborador por DT (mais antigo → mais recente).
   *  - STATUS === 'TRABALHADO' incrementa a sequência; qualquer outro valor zera.
   *  - Se houver um intervalo sem nenhum registro entre duas datas (gap > 1 dia),
   *    isso também quebra a sequência.
   *  - Se o último registro do colaborador não for 'TRABALHADO', a sequência
   *    atual é 0 (decorre naturalmente do laço abaixo).
   *
   * @param {Array<Object>} registros - base completa de DATASETS.saldoDia.data
   * @returns {Array<{COLABORADOR: string, LOJA: string, FUNCAO: string, GERENTE: string, SUPERVISOR: string, sequenciaAtual: number, horasNormais: number}>}
   */
  function calcularSequenciasAtuais(registros) {
    // Agrupa por COLABORADOR + LOJA (não só por nome) para não somar, num mesmo
    // total, registros de uma pessoa com o mesmo nome em outra loja (homônimos
    // ou transferências) — Utils.groupBy só aceita uma chave simples, então o
    // agrupamento composto é feito aqui mesmo, sem alterar utils.js.
    const porColaborador = registros.reduce((acc, item) => {
      const groupKey = `${item.COLABORADOR}||${item.LOJA}`;
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(item);
      return acc;
    }, {});
    const resultado = [];

    Object.keys(porColaborador).forEach((groupKey) => {
      const grupo = porColaborador[groupKey];
      const colaborador = grupo[0] ? grupo[0].COLABORADOR : '';
      if (!colaborador || colaborador === 'undefined') return;

      const registrosOrdenados = [...grupo].sort((a, b) => {
        const da = a.DT ? a.DT.getTime() : 0;
        const db = b.DT ? b.DT.getTime() : 0;
        return da - db;
      });

      let sequencia = 0;
      let dataAnterior = null;
      let horasNormais = 0; // horas efetivamente trabalhadas nos registros com STATUS === 'TRABALHADO'

      registrosOrdenados.forEach((r) => {
        if (dataAnterior && r.DT) {
          const diffDias = Math.round((r.DT.getTime() - dataAnterior.getTime()) / 86400000);
          if (diffDias > 1) sequencia = 0; // intervalo sem registro quebra a sequência
        }
        sequencia = r.STATUS === 'TRABALHADO' ? sequencia + 1 : 0;
        if (r.STATUS === 'TRABALHADO') {
          const totalNormais = r.TOTAL_NORMAIS || 0;
          const bancoTotal = r.BANCO_TOTAL || 0;
          if (totalNormais > 0 && bancoTotal > 0) {
            horasNormais += totalNormais + bancoTotal;
          } else if (totalNormais > 0 && bancoTotal <= 0) {
            horasNormais += totalNormais;
          }
          // totalNormais <= 0: não soma nada
        }
        if (r.DT) dataAnterior = r.DT;
      });

      const ultimoRegistro = registrosOrdenados[registrosOrdenados.length - 1];
      resultado.push({
        COLABORADOR: colaborador,
        LOJA: ultimoRegistro ? ultimoRegistro.LOJA : '',
        FUNCAO: ultimoRegistro ? ultimoRegistro.FUNCAO : '',
        GERENTE: ultimoRegistro ? ultimoRegistro.GERENTE : '',
        SUPERVISOR: ultimoRegistro ? ultimoRegistro.SUPERVISOR : '',
        sequenciaAtual: sequencia,
        horasNormais: horasNormais,
      });
    });

    return resultado;
  }

  /** Variante visual (tag) usada para destacar sequências mais longas, sem criar novo padrão de UI. */
  function sequenciaVariant(dias) {
    if (dias >= 7) return 'urgent';
    if (dias >= 4) return 'warning';
    return 'neutral';
  }

  function renderBancoHoras(container) {
    const saldoTotalRes = DATASETS.saldoTotal;
    const saldoDiaRes = DATASETS.saldoDia;
    const loading = !hasLoadedOnce;

    if (!loading) {
      if (!saldoTotalRes.ok) container.appendChild(errorBannerFor('saldoTotal', saldoTotalRes));
      if (!saldoDiaRes.ok) container.appendChild(errorBannerFor('saldoDia', saldoDiaRes));
    }

    container.appendChild(alertBanner({
      title: 'Como o saldo é calculado',
      message: 'O saldo atual do Banco de Horas exibido nos KPIs, gráficos e no ranking vem sempre da base de Saldo Total (fonte de verdade oficial por colaborador). A base de Saldo Diário é usada só para o detalhamento de movimentação dia a dia, na tabela abaixo — os dois valores não são somados entre si.',
      variant: 'warning',
    }));

    const filterWrap = Utils.el('div');
    const kpiWrap = Utils.el('div');
    const chartsWrap = Utils.el('div');
    const rankingSaldoWrap = Utils.el('div');
    const sequenciaWrap = Utils.el('div');

    container.appendChild(filterWrap);
    container.appendChild(sectionHeader(
      'Banco de Horas',
      'Saldo atual por colaborador (fonte: Saldo Total) e movimentação diária (fonte: Saldo Diário)'
    ));
    container.appendChild(kpiWrap);
    container.appendChild(sectionHeader('Distribuição do saldo'));
    container.appendChild(chartsWrap);
    container.appendChild(sectionHeader('Saldo atual por colaborador', 'Ordenado do maior para o menor saldo, no período/filtro selecionado'));
    container.appendChild(rankingSaldoWrap);
    container.appendChild(sectionHeader('Sequência atual de dias trabalhados', 'Dias consecutivos com STATUS = TRABALHADO até o último registro de cada colaborador (base completa — não é afetada pelo filtro de Status)'));
    container.appendChild(sequenciaWrap);

    const combinedForOptions = [...saldoTotalRes.data, ...saldoDiaRes.data];

    function update(state) {
      const { busca, STATUS: statusFiltro, ...matchFilters } = state;

      // Saldo atual (KPIs, gráficos e ranking): usa só LOJA/FUNCAO/busca — STATUS
      // não existe na base de Saldo Total, então não filtra essa base.
      const filteredSaldoTotal = Utils.filterByBusca(
        Filters.applyFilters(saldoTotalRes.data, matchFilters), busca, ['COLABORADOR']
      );

      /* ------------------------------ Agregações-base (Saldo Total) ------------------------------ */
      const saldoTotalGeral = filteredSaldoTotal.reduce((sum, r) => sum + (r.BANCO_TOTAL || 0), 0);
      const comSaldoNegativo = filteredSaldoTotal.filter((r) => (r.BANCO_TOTAL || 0) < 0);

      const porLoja = Utils.groupBy(filteredSaldoTotal, 'LOJA');
      const lojaStats = Object.keys(porLoja)
        .filter((k) => k && k !== 'undefined')
        .map((loja) => ({ loja, saldo: porLoja[loja].reduce((s, r) => s + (r.BANCO_TOTAL || 0), 0) }))
        .sort((a, b) => b.saldo - a.saldo);

      const colaboradorStats = [...filteredSaldoTotal].sort((a, b) => (b.BANCO_TOTAL || 0) - (a.BANCO_TOTAL || 0));
      const maiorSaldoPositivo = colaboradorStats[0];
      const maiorDeficit = colaboradorStats[colaboradorStats.length - 1];
      const lojaMaiorSaldo = lojaStats[0];
      const lojaMaiorDeficit = lojaStats[lojaStats.length - 1];

      /* ------------------------------ KPIs ------------------------------ */
      Utils.emptyNode(kpiWrap);
      kpiWrap.appendChild(kpiGrid([
        { icon: 'dashboard', label: 'Colaboradores no saldo', value: Utils.formatNumber(filteredSaldoTotal.length), loading },
        {
          icon: 'bancoHoras', label: 'Saldo total da rede',
          value: loading ? '···' : Utils.formatHoras(saldoTotalGeral),
          deltaDirection: saldoTotalGeral < 0 ? 'down' : (saldoTotalGeral > 0 ? 'up' : undefined),
          loading,
        },
        {
          icon: 'scale', label: 'Saldo médio por colaborador',
          value: loading ? '···' : Utils.formatHoras(filteredSaldoTotal.length ? saldoTotalGeral / filteredSaldoTotal.length : 0),
          loading,
        },
        { icon: 'warning', label: 'Colaboradores com saldo negativo', value: Utils.formatNumber(comSaldoNegativo.length), loading },
        {
          icon: 'trendUp', label: 'Maior saldo positivo',
          value: maiorSaldoPositivo ? maiorSaldoPositivo.COLABORADOR : '—',
          delta: maiorSaldoPositivo ? Utils.formatHoras(maiorSaldoPositivo.BANCO_TOTAL) : '',
          loading,
        },
        {
          icon: 'trendDown', label: 'Maior déficit',
          value: maiorDeficit ? maiorDeficit.COLABORADOR : '—',
          delta: maiorDeficit ? Utils.formatHoras(maiorDeficit.BANCO_TOTAL) : '',
          loading,
        },
        {
          icon: 'scale', label: 'Loja com maior saldo acumulado',
          value: lojaMaiorSaldo ? lojaMaiorSaldo.loja : '—',
          delta: lojaMaiorSaldo ? Utils.formatHoras(lojaMaiorSaldo.saldo) : '',
          loading,
        },
        {
          icon: 'warning', label: 'Loja com maior déficit acumulado',
          value: lojaMaiorDeficit ? lojaMaiorDeficit.loja : '—',
          delta: lojaMaiorDeficit ? Utils.formatHoras(lojaMaiorDeficit.saldo) : '',
          loading,
        },
      ]));

      /* ------------------------------ Gráficos ------------------------------ */
      const lojasPorSaldo = [...lojaStats].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo)).slice(0, 10);
      const top10Positivos = colaboradorStats.filter((r) => (r.BANCO_TOTAL || 0) > 0).slice(0, 10);
      const top10Deficit = [...colaboradorStats].filter((r) => (r.BANCO_TOTAL || 0) < 0).reverse().slice(0, 10);

      Utils.emptyNode(chartsWrap);
      chartsWrap.appendChild(realChartGrid([
        {
          title: 'Top 10 lojas por saldo (em módulo)',
          type: 'bar',
          data: {
            labels: lojasPorSaldo.map((l) => l.loja),
            datasets: [{
              label: 'Saldo (horas decimais)',
              data: lojasPorSaldo.map((l) => Number(l.saldo.toFixed(2))),
              backgroundColor: lojasPorSaldo.map((l) => (l.saldo < 0 ? Charts.PALETTE[3] : Charts.PALETTE[2])),
            }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Top 10 colaboradores — maior saldo positivo',
          type: 'bar',
          data: {
            labels: top10Positivos.map((r) => r.COLABORADOR),
            datasets: [{
              label: 'Saldo (horas decimais)',
              data: top10Positivos.map((r) => Number((r.BANCO_TOTAL || 0).toFixed(2))),
              backgroundColor: Charts.PALETTE[2],
            }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Top 10 colaboradores — maior déficit',
          type: 'bar',
          data: {
            labels: top10Deficit.map((r) => r.COLABORADOR),
            datasets: [{
              label: 'Saldo (horas decimais)',
              data: top10Deficit.map((r) => Number((r.BANCO_TOTAL || 0).toFixed(2))),
              backgroundColor: Charts.PALETTE[3],
            }],
          },
          options: { indexAxis: 'y', plugins: { legend: { display: false } } },
        },
        {
          title: 'Colaboradores: saldo positivo vs. negativo',
          type: 'donut',
          data: {
            labels: ['Saldo positivo', 'Saldo negativo', 'Saldo zerado'],
            datasets: [{
              data: [
                filteredSaldoTotal.filter((r) => (r.BANCO_TOTAL || 0) > 0).length,
                comSaldoNegativo.length,
                filteredSaldoTotal.filter((r) => (r.BANCO_TOTAL || 0) === 0).length,
              ],
              backgroundColor: [Charts.PALETTE[2], Charts.PALETTE[3], Charts.PALETTE[5]],
            }],
          },
        },
      ]));

      /* ------------------------------ Ranking: Saldo atual por colaborador ------------------------------ */
      Utils.emptyNode(rankingSaldoWrap);
      rankingSaldoWrap.appendChild(dataTableCard({
        title: 'Saldo atual por colaborador',
        columns: ['Posição', 'Colaborador', 'Função', 'Loja', 'Saldo atual'],
        rows: colaboradorStats,
        loading,
        mapRow: (r, i) => [
          td(i + 1), td(r.COLABORADOR), td(r.FUNCAO), td(r.LOJA), td(Utils.formatHoras(r.BANCO_TOTAL)),
        ],
      }));

      /* ------------------------------ Sequência atual de dias trabalhados ------------------------------ *
       * Calculada sobre a base COMPLETA de saldoDiaRes.data (todos os STATUS),
       * nunca sobre filteredSaldoDia — que já teve o filtro de STATUS aplicado
       * e removeria os dias de quebra da sequência (ver calcularSequenciasAtuais).
       * Apenas os filtros de apresentação (LOJA/FUNCAO/busca) são usados para
       * decidir quais colaboradores aparecem na lista abaixo. */
      const sequenciasTodas = calcularSequenciasAtuais(saldoDiaRes.data);
      const sequenciasFiltradas = Utils.filterByBusca(
        Filters.applyFilters(sequenciasTodas, matchFilters), busca, ['COLABORADOR']
      ).sort((a, b) => b.sequenciaAtual - a.sequenciaAtual);

      // Ordem usada só na exportação (Excel/PDF): LOJA e, dentro de cada loja,
      // Horas Normais do maior para o menor. A tabela em tela continua ordenada
      // por Dias consecutivos (sequenciasFiltradas, acima), sem alteração.
      const sequenciasParaExportar = [...sequenciasFiltradas].sort((a, b) => {
        const lojaCompare = String(a.LOJA || '').localeCompare(String(b.LOJA || ''), 'pt-BR', { numeric: true });
        if (lojaCompare !== 0) return lojaCompare;
        return (b.horasNormais || 0) - (a.horasNormais || 0);
      });

      Utils.emptyNode(sequenciaWrap);
      sequenciaWrap.appendChild(dataTableCard({
        title: 'Sequência atual de dias trabalhados',
        columns: ['Colaborador', 'Loja', 'Dias consecutivos', 'Horas Normais'],
        rows: sequenciasFiltradas,
        exportRows: sequenciasParaExportar,
        loading,
        mapRow: (r) => [
          td(r.COLABORADOR), td(r.LOJA), tdTag(String(r.sequenciaAtual), sequenciaVariant(r.sequenciaAtual)), td(Utils.formatHoras(r.horasNormais)),
        ],
      }));

    }

    // Gerente → Supervisor: a cada mudança de estado, recalcula a lista de
    // Supervisores válidos para o Gerente selecionado (ou todos, se GERENTE
    // estiver em "Todos") e sincroniza tanto o <select> quanto o estado
    // interno do filtro via a API já exposta por filters.js (setOptions /
    // setState) — sem duplicar lógica nem alterar filters.js.
    function syncSupervisorOptions(state) {
      const gerente = state.GERENTE || '';
      const supervisorPool = gerente
        ? combinedForOptions.filter((r) => r.GERENTE === gerente)
        : combinedForOptions;
      const supervisorOptions = Utils.uniqueValues(supervisorPool, 'SUPERVISOR');
      filterApi.setOptions('SUPERVISOR', supervisorOptions);
      if (state.SUPERVISOR && !supervisorOptions.includes(state.SUPERVISOR)) {
        filterApi.setState({ SUPERVISOR: '' });
        state.SUPERVISOR = '';
      }
    }

    const filterApi = Filters.createFilterBar(filterWrap, [
      { key: 'LOJA', label: 'Loja', options: Utils.uniqueValues(combinedForOptions, 'LOJA') },
      { key: 'FUNCAO', label: 'Função', options: Utils.uniqueValues(combinedForOptions, 'FUNCAO') },
      { key: 'GERENTE', label: 'Gerente', options: Utils.uniqueValues(combinedForOptions, 'GERENTE') },
      { key: 'SUPERVISOR', label: 'Supervisor', options: Utils.uniqueValues(combinedForOptions, 'SUPERVISOR') },
      { key: 'STATUS', label: 'Status (movimentação diária)', options: Utils.uniqueValues(saldoDiaRes.data, 'STATUS') },
      { key: 'busca', label: 'Colaborador', type: 'text', placeholder: 'Buscar por nome…' },
    ], (state) => {
      syncSupervisorOptions(state);
      persistFilterState('banco-horas', state);
      update(state);
    });

    if (filterStateByModule['banco-horas']) filterApi.setState(filterStateByModule['banco-horas']);
    syncSupervisorOptions(filterApi.getState());
    update(filterApi.getState());
  }

  /** Constrói o banner de erro específico de um dataset, com botão de nova tentativa. */
  function errorBannerFor(key, result) {
    const label = GoogleSheets.datasetLabels[key] || key;
    const message = result.stale
      ? `${result.error} Exibindo os últimos dados salvos localmente, que podem estar desatualizados.`
      : result.error;
    return alertBanner({
      title: `Base de ${label} indisponível`,
      message,
      variant: result.stale ? 'warning' : 'error',
      onRetry: () => loadAllData(true),
    });
  }


  /* --------------------------------------------------------------------
   * 7. CARGA DE DADOS (integração com googleSheets.js)
   * ------------------------------------------------------------------ */

  async function loadAllData(force = false) {
    const isFirstLoad = !hasLoadedOnce;
    setRefreshButtonLoading(true);
    const [{ admissoes, desligamentos, lojas }, rescisoes, ferias, quebraCaixa, lojaFuncao, saldoDia, saldoTotal, absenteismo] = await Promise.all([
      GoogleSheets.fetchAll({ force }),
      GoogleSheets.fetchRescisoes(),
      GoogleSheets.fetchFerias({ force }),
      GoogleSheets.fetchQuebraCaixa({ force }),
      GoogleSheets.fetchLojaFuncao({ force }),
      GoogleSheets.fetchSaldoDia({ force }),
      GoogleSheets.fetchSaldoTotal({ force }),
      GoogleSheets.fetchAbsenteismo({ force }),
    ]);
    DATASETS.admissoes = admissoes;
    DATASETS.desligamentos = desligamentos;
    DATASETS.lojas = lojas;
    DATASETS.rescisoes = rescisoes;
    DATASETS.ferias = ferias;
    DATASETS.quebraCaixa = quebraCaixa;
    DATASETS.lojaFuncao = lojaFuncao;
    DATASETS.saldoDia = saldoDia;
    DATASETS.saldoTotal = saldoTotal;
    DATASETS.absenteismo = absenteismo;
    hasLoadedOnce = true;
    setRefreshButtonLoading(false);
    updateSyncIndicator();
    rerenderCurrentModule();

    if (isFirstLoad) {
      hideLoadingScreen();
    } else {
      // Feedback de "Atualizar dados" clicado manualmente — mensagem amigável
      // de acordo com o status agregado das bases (sucesso/parcial/falha).
      const overall = GoogleSheets.getOverallStatus();
      if (overall === 'success') Utils.toast('Dados atualizados com sucesso.', 'success');
      else if (overall === 'partial') Utils.toast('Dados atualizados parcialmente — uma ou mais bases falharam.', 'warning');
      else Utils.toast('Não foi possível atualizar os dados agora.', 'error');
    }
  }

  /** Esconde a tela de carregamento inicial com uma transição suave (ver CSS: .app-loading). */
  function hideLoadingScreen() {
    const screen = Utils.qs('#appLoadingScreen');
    if (!screen) return;
    screen.classList.add('app-loading--hidden');
    setTimeout(() => screen.remove(), 420);
  }

  function setRefreshButtonLoading(isLoading) {
    const btn = Utils.qs('#refreshDataBtn');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle('is-loading', isLoading);
  }

  /** Atualiza o indicador de sincronização (sidebar) e o selo "última atualização" (topbar). */
  function updateSyncIndicator() {
    const dot = Utils.qs('#syncStatusDot');
    const text = Utils.qs('.sidebar__footer-text');
    const updatedBadge = Utils.qs('#lastUpdated');
    const updatedText = Utils.qs('#lastUpdatedText');
    if (!dot) return;

    const overall = GoogleSheets.getOverallStatus();
    dot.className = 'status-dot';
    updatedBadge.className = 'topbar__updated';

    if (overall === 'loading') {
      dot.classList.add('status-dot--syncing');
      text.textContent = 'Sincronizando dados…';
      updatedBadge.classList.add('topbar__updated--syncing');
      updatedText.textContent = 'Sincronizando…';
      return;
    }

    if (overall === 'success') {
      dot.classList.add('status-dot--online');
      updatedBadge.classList.add('topbar__updated--online');
    } else if (overall === 'partial') {
      dot.classList.add('status-dot--warning');
      updatedBadge.classList.add('topbar__updated--syncing');
    } else {
      dot.classList.add('status-dot--offline');
      updatedBadge.classList.add('topbar__updated--error');
    }

    const timestamps = ['admissoes', 'desligamentos', 'lojas']
      .map((k) => GoogleSheets.getLastUpdated(k))
      .filter(Boolean);
    const mostRecent = timestamps.length ? new Date(Math.max(...timestamps.map((d) => d.getTime()))) : null;

    if (overall === 'success') {
      const hora = mostRecent ? Utils.formatDateTime(mostRecent).split(' ').pop() : '';
      text.textContent = `Dados atualizados às ${hora}`;
      updatedText.textContent = mostRecent ? `Atualizado às ${hora}` : 'Dados atualizados';
    } else if (overall === 'partial') {
      text.textContent = 'Dados parciais — uma ou mais bases falharam';
      updatedText.textContent = 'Sincronização parcial';
    } else {
      text.textContent = 'Falha ao sincronizar dados';
      updatedText.textContent = 'Falha na sincronização';
    }
  }


  /* --------------------------------------------------------------------
   * 8. INTERAÇÕES DE LAYOUT (sidebar colapsável, menu mobile, botão atualizar)
   * ------------------------------------------------------------------ */

  function initSidebarCollapse() {
    const sidebar = Utils.qs('#sidebar');
    const btn = Utils.qs('#sidebarCollapseBtn');
    btn.addEventListener('click', () => {
      const collapsed = sidebar.getAttribute('data-collapsed') === 'true';
      sidebar.setAttribute('data-collapsed', String(!collapsed));
    });
  }

  function initMobileMenu() {
    const sidebar = Utils.qs('#sidebar');
    const overlay = Utils.qs('#sidebarOverlay');
    const openBtn = Utils.qs('#mobileMenuBtn');
    openBtn.addEventListener('click', () => {
      sidebar.classList.add('is-open');
      overlay.classList.add('is-visible');
    });
    overlay.addEventListener('click', closeMobileSidebar);
  }

  function closeMobileSidebar() {
    Utils.qs('#sidebar').classList.remove('is-open');
    Utils.qs('#sidebarOverlay').classList.remove('is-visible');
  }

  function initRefreshButton() {
    Utils.qs('#refreshDataBtn').addEventListener('click', () => loadAllData(true));
  }


  /* --------------------------------------------------------------------
   * 9. INICIALIZAÇÃO
   * ------------------------------------------------------------------ */
  /**
   * Tratamento de erros não previstos (bug em algum módulo, falha de rede
   * fora do fluxo de googleSheets.js, etc.): evita que o usuário veja uma
   * tela travada/branca — mostra um aviso amigável e registra o detalhe
   * técnico no console para depuração, sem interromper o uso do portal.
   */
  function initGlobalErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('[Portal RH] Erro não tratado:', event.error || event.message);
      Utils.toast('Ocorreu um erro inesperado. Se persistir, atualize a página.', 'error');
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[Portal RH] Promessa rejeitada sem tratamento:', event.reason);
      Utils.toast('Ocorreu um erro inesperado. Se persistir, atualize a página.', 'error');
    });
  }

  function init() {
    initGlobalErrorHandling();
    initSidebarCollapse();
    initMobileMenu();
    initRefreshButton();

    // Reage a eventos de loading/sucesso/erro emitidos pelo googleSheets.js
    // (ex: atualiza o "dot" de sincronização em tempo real durante o fetch).
    GoogleSheets.subscribe(() => updateSyncIndicator());

    if (!window.location.hash) window.location.hash = DEFAULT_MODULE;
    navigateTo(getModuleFromHash());   // primeira renderização (estado de loading)
    updateSyncIndicator();
    loadAllData(false);                 // carga automática inicial (usa cache se válido)
  }

  document.addEventListener('DOMContentLoaded', init);

})();
