/* ============================================================================
   GOOGLESHEETS.JS
   ----------------------------------------------------------------------------
   ÚNICA responsabilidade deste arquivo: comunicação com o Google Sheets.
   Nenhum outro arquivo do projeto deve conter fetch(), parsing de CSV ou
   URLs de planilha — tudo isso fica isolado aqui. Os demais módulos (script.js,
   filters.js, charts.js) só conhecem o contrato de saída: listas de objetos
   JavaScript já normalizadas.

   O que este arquivo faz:
     1. Lê automaticamente os CSVs publicados (Arquivo > Compartilhar >
        Publicar na Web) das 3 bases: Admissões, Desligamentos e Lojas.
     2. Converte o CSV em JSON (parser próprio, sem dependência externa).
     3. Padroniza nomes de colunas (independente de acento/maiúsculas na
        planilha de origem), em campos previsíveis (ex: MES, FUNCAO).
     4. Ignora linhas totalmente vazias e linhas sem o campo-chave.
     5. Trata erros de rede/HTTP/parse com mensagens amigáveis, e cai para o
        último cache válido (localStorage) quando uma leitura falha.
     6. Expõe estados de "loading" via um sistema simples de subscribe/emit,
        para a UI (script.js) exibir spinners/indicadores sem acoplamento.
     7. Mantém cache em memória (rápido, por sessão) + localStorage
        (persistente, sobrevive a reload), com TTL configurável.
     8. Expõe refreshAll() para o botão "Atualizar Dados" da interface,
        que ignora o cache e força uma leitura nova.
   ============================================================================ */

const GoogleSheets = (() => {

  /* ==========================================================================
   * 1. CONFIGURAÇÃO
   * ======================================================================== */

  // Links dos CSVs publicados (Arquivo > Compartilhar > Publicar na Web).
  // As bases são atualizadas diariamente na planilha de origem; a leitura
  // aqui é sempre automática (sem intervenção manual) — o único cache é o
  // interno deste arquivo, controlado por CACHE_TTL_MS abaixo.
  const SHEET_URLS = {
    desligamentos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTYTRGopcpzbidNNiMTbW6UnRjSEE7iXEsrIsUyd_HXRyZ3wBp3NwBanQB-ah-3MSlxyQpcyQirNs1O/pub?gid=0&single=true&output=csv',
    admissoes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTYTRGopcpzbidNNiMTbW6UnRjSEE7iXEsrIsUyd_HXRyZ3wBp3NwBanQB-ah-3MSlxyQpcyQirNs1O/pub?gid=1814932616&single=true&output=csv',
    lojas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTYTRGopcpzbidNNiMTbW6UnRjSEE7iXEsrIsUyd_HXRyZ3wBp3NwBanQB-ah-3MSlxyQpcyQirNs1O/pub?gid=1839596594&single=true&output=csv',
    ferias: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTYTRGopcpzbidNNiMTbW6UnRjSEE7iXEsrIsUyd_HXRyZ3wBp3NwBanQB-ah-3MSlxyQpcyQirNs1O/pub?gid=1382201064&single=true&output=csv',
    quebraCaixa: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTYTRGopcpzbidNNiMTbW6UnRjSEE7iXEsrIsUyd_HXRyZ3wBp3NwBanQB-ah-3MSlxyQpcyQirNs1O/pub?gid=310364116&single=true&output=csv',
  };

  // As bases são atualizadas 1x/dia — 10 minutos de cache evita recarregar a
  // cada troca de filtro/tela, mas ainda mantém os dados "do dia" sempre frescos.
  const CACHE_TTL_MS = 10 * 60 * 1000;

  // Prefixo das chaves gravadas no localStorage (cache persistente entre sessões).
  const STORAGE_PREFIX = 'rhPortal:cache:v1:';

  // Mensagens amigáveis exibidas na interface quando uma base falha ao carregar.
  const FRIENDLY_ERRORS = {
    admissoes: 'Não foi possível carregar a base de Admissões agora. Verifique sua conexão e tente novamente.',
    desligamentos: 'Não foi possível carregar a base de Desligamentos agora. Verifique sua conexão e tente novamente.',
    lojas: 'Não foi possível carregar a base de Lojas/Headcount agora. Verifique sua conexão e tente novamente.',
    ferias: 'Não foi possível carregar a base de Férias agora. Verifique sua conexão e tente novamente.',
    quebraCaixa: 'Não foi possível carregar a base de Quebra de Caixa agora. Verifique sua conexão e tente novamente.',
  };

  const DATASET_LABELS = {
    admissoes: 'Admissões',
    desligamentos: 'Desligamentos',
    lojas: 'Lojas / Headcount',
    ferias: 'Férias',
    quebraCaixa: 'Quebra de Caixa',
  };


  /* ==========================================================================
   * 2. ESQUEMA DAS PLANILHAS (mapeamento posicional, documentado)
   * ======================================================================== *
   * O mapeamento é feito por POSIÇÃO da coluna (não pelo nome do cabeçalho).
   * Isso evita quebra por causa de acentuação/variações de exportação do CSV
   * (ex: "MÊS" às vezes sai "MÃŠS" dependendo da codificação) e também porque
   * a planilha de origem tem colunas "COLABORADOR" duplicadas (nome completo
   * e nome abreviado), o que impede usar o nome como chave única.
   *
   * Se a ordem das colunas mudar na planilha de origem, ajuste os índices
   * abaixo — é o único lugar que precisa mudar.
   * ------------------------------------------------------------------------ */

  // BASE_ADMISSOES: DATA | COLABORADOR | COLABORADOR (abrev.) | LOJA | MÊS | STATUS | GERENTE | SUPERVISOR | FUNÇÃO
  const ADMISSOES_FIELDS = [
    'DATA', 'COLABORADOR', 'COLABORADOR_ABREVIADO', 'LOJA', 'MES', 'STATUS', 'GERENTE', 'SUPERVISOR', 'FUNCAO',
  ];

  // BASE_DEMISSOES: COLABORADOR | TIPO_DOC | TIPO_AVISO | DATA | LOJA | MÊS | GERENTE | SUPERVISOR | FUNÇÃO
  // (Esta base NÃO tem coluna de "nome abreviado" — diferente da BASE_ADMISSOES.
  //  Corrigido em 27/07/2026: o mapeamento antigo tinha 10 campos para um CSV
  //  de 9 colunas, o que deslocava DATA/LOJA/MES/GERENTE/SUPERVISOR/FUNCAO
  //  uma posição inteira, quebrando o parse de data e os gráficos mensais.)
  const DESLIGAMENTOS_FIELDS = [
    'COLABORADOR', 'TIPO_DOC', 'TIPO_AVISO', 'DATA', 'LOJA', 'MES', 'GERENTE', 'SUPERVISOR', 'FUNCAO', 'STATUS',
  ];

  // BASE_LOJA: LOJA | HEADCOUNT
  const LOJAS_FIELDS = ['LOJA', 'HEADCOUNT'];

  // BASE_FERIAS: COLABORADOR | ADMISSÃO | FUNÇÃO | LOJA | PREVISÃO | STATUS | GERENTE | SUPERVISOR
  // (PREVISÃO vem vazia ou como "-" para colaboradores cujo período ainda não
  //  foi programado — uma data inválida vira null, sem quebrar o parse das
  //  demais colunas. GERENTE/SUPERVISOR são as duas últimas colunas.)
  const FERIAS_FIELDS = ['COLABORADOR', 'ADMISSAO', 'FUNCAO', 'LOJA', 'PREVISAO', 'STATUS', 'GERENTE', 'SUPERVISOR'];

  // BASE_QUEBRA_CAIXA: COLABORADOR | VALOR | LOJA | GERENTE | SUPER | DT
  // (A coluna de origem "DT" traz só a abreviação do mês — "DEZ", "FEV" etc. —
  //  e é mapeada para MES, no mesmo padrão de texto usado pelas demais bases;
  //  não é tratada como data, já que não vem com dia/ano.)
  const QUEBRA_FIELDS = ['COLABORADOR', 'VALOR', 'LOJA', 'GERENTE', 'SUPERVISOR', 'MES'];

  // Campos que recebem tratamento especial de tipo (Date / Number) após o mapeamento posicional.
  const DATE_FIELDS = new Set(['DATA', 'ADMISSAO', 'PREVISAO']);
  const NUMBER_FIELDS = new Set(['HEADCOUNT']);
  // Campos monetários no formato brasileiro (ex: "R$ 33,00") — tratados à parte
  // de NUMBER_FIELDS para preservar centavos (ver _parseCurrencyBR).
  const CURRENCY_FIELDS = new Set(['VALOR']);

  // Campo usado para decidir se uma linha é "vazia" e deve ser ignorada.
  const REQUIRED_FIELD = {
    admissoes: 'COLABORADOR',
    desligamentos: 'COLABORADOR',
    lojas: 'LOJA',
    ferias: 'COLABORADOR',
    quebraCaixa: 'COLABORADOR',
  };


  /* ==========================================================================
   * 3. ESTADO INTERNO (cache em memória, status, listeners)
   * ======================================================================== */

  const _memoryCache = new Map();   // key -> { data, timestamp }
  const _status = { admissoes: 'idle', desligamentos: 'idle', lojas: 'idle' }; // idle|loading|success|error
  const _lastUpdated = { admissoes: null, desligamentos: null, lojas: null };  // Date | null
  const _lastError = { admissoes: null, desligamentos: null, lojas: null };    // string | null
  const _listeners = new Set();

  /** Inscreve um observador para eventos de carregamento. Retorna função de "unsubscribe". */
  function subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }

  function _emit(event) {
    _listeners.forEach((fn) => {
      try { fn(event); } catch (err) { console.error('[GoogleSheets] Erro em listener:', err); }
    });
  }


  /* ==========================================================================
   * 4. PARSER DE CSV (RFC 4180 simplificado — sem dependência externa)
   * ======================================================================== */

  /**
   * Converte um texto CSV em uma matriz de linhas (cada linha é um array de
   * strings). Suporta campos entre aspas contendo vírgulas, quebras de linha
   * e aspas escapadas (""), como o Google Sheets exporta.
   */
  function _parseCSV(text) {
    // Remove BOM (comum em exportações do Google Sheets)
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') { field += '"'; i++; }
        else if (char === '"') { inQuotes = false; }
        else { field += char; }
        continue;
      }

      if (char === '"') { inQuotes = true; }
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\r') { /* ignora — tratado junto do \n */ }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else { field += char; }
    }
    // Último campo/linha (arquivos nem sempre terminam com quebra de linha)
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

    // Ignora linhas totalmente vazias (célula única vazia ou todas as células vazias)
    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  }


  /* ==========================================================================
   * 5. NORMALIZAÇÃO DE LINHAS → OBJETOS JSON PADRONIZADOS
   * ======================================================================== */

  /** Faz o parse de datas em formatos comuns exportados pelo Sheets (ISO ou dd/mm/aaaa). */
  function _parseDate(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;

    // ISO: 2026-06-01 (com ou sem horário)
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    // BR: 01/06/2026
    const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (brMatch) {
      const [, d, m, y] = brMatch;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    // Fallback genérico
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function _parseNumber(raw) {
    const digits = String(raw || '').replace(/[^\d-]/g, '');
    const num = parseInt(digits, 10);
    return Number.isNaN(num) ? 0 : num;
  }

  /** Converte moeda brasileira (ex: "R$ 33,00", "1.234,56") em Number (33, 1234.56), preservando centavos. */
  function _parseCurrencyBR(raw) {
    const cleaned = String(raw || '').replace(/[^\d,.-]/g, '').trim();
    if (!cleaned) return 0;
    // Remove separador de milhar (.) e troca a vírgula decimal por ponto.
    const normalized = cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return Number.isNaN(num) ? 0 : num;
  }

  /**
   * Mapeia as linhas cruas do CSV (já sem o cabeçalho) para objetos JSON
   * padronizados, usando a lista de campos posicional do dataset.
   * Ignora linhas vazias e linhas sem o campo obrigatório preenchido.
   */
  function _mapRows(datasetKey, rawRows, fieldNames) {
    const requiredField = REQUIRED_FIELD[datasetKey];
    const [, ...dataRows] = rawRows; // descarta a linha de cabeçalho

    const mapped = dataRows.map((cells) => {
      const obj = {};
      fieldNames.forEach((fieldName, index) => {
        const raw = (cells[index] ?? '').trim();
        if (DATE_FIELDS.has(fieldName)) {
          obj[fieldName] = _parseDate(raw);
          obj[`${fieldName}_TEXTO`] = raw;
        } else if (NUMBER_FIELDS.has(fieldName)) {
          obj[fieldName] = _parseNumber(raw);
        } else if (CURRENCY_FIELDS.has(fieldName)) {
          obj[fieldName] = _parseCurrencyBR(raw);
        } else {
          // Uniformiza a coluna LOJA como texto (existem lojas numéricas e "ADM"/"CD")
          obj[fieldName] = fieldName === 'LOJA' ? raw.toUpperCase() : raw;
        }
      });
      return obj;
    });

    // Ignora linhas em branco (linha inteira vazia ou sem o campo-chave)
    return mapped.filter((obj) => {
      const key = obj[requiredField];
      return key !== undefined && key !== null && String(key).trim() !== '';
    });
  }


  /* ==========================================================================
   * 6. CACHE (memória + localStorage)
   * ======================================================================== */

  function _saveLocalCache(key, data) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    } catch (err) {
      // localStorage pode estar indisponível (modo privado, quota excedida) — não é crítico.
      console.warn('[GoogleSheets] Não foi possível gravar cache local:', err.message);
    }
  }

  function _loadLocalCache(key) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Datas viram string no JSON — reconstitui os campos de data conhecidos.
      if (Array.isArray(parsed.data)) {
        parsed.data.forEach((row) => {
          DATE_FIELDS.forEach((field) => {
            if (row[field]) row[field] = new Date(row[field]);
          });
        });
      }
      return parsed;
    } catch (err) {
      console.warn('[GoogleSheets] Não foi possível ler cache local:', err.message);
      return null;
    }
  }

  /** Limpa cache em memória e persistente de todas as bases (ou de uma específica). */
  function clearCache(key) {
    if (key) {
      _memoryCache.delete(key);
      try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (_) { /* ignora */ }
    } else {
      _memoryCache.clear();
      Object.keys(SHEET_URLS).forEach((k) => {
        try { localStorage.removeItem(STORAGE_PREFIX + k); } catch (_) { /* ignora */ }
      });
    }
  }


  /* ==========================================================================
   * 7. LEITURA (fetch automático de cada base)
   * ======================================================================== */

  const FIELD_MAPS = {
    admissoes: ADMISSOES_FIELDS,
    desligamentos: DESLIGAMENTOS_FIELDS,
    lojas: LOJAS_FIELDS,
    ferias: FERIAS_FIELDS,
    quebraCaixa: QUEBRA_FIELDS,
  };

  /**
   * Busca uma base específica ('admissoes' | 'desligamentos' | 'lojas').
   * Sempre retorna um objeto estável (nunca lança exceção para quem chama):
   *   { ok, data, error, stale, fromCache }
   *
   * - ok: true se a leitura mais recente teve sucesso.
   * - data: array de objetos já normalizados (nunca undefined; [] se vazio/erro sem cache).
   * - error: mensagem amigável (null se ok).
   * - stale: true se "data" veio de um cache antigo por causa de uma falha.
   * - fromCache: true se não houve requisição de rede (cache em memória ainda válido).
   */
  async function _fetchDataset(key, { force = false } = {}) {
    if (!SHEET_URLS[key]) {
      return { ok: false, data: [], error: `Base "${key}" não configurada.`, stale: false, fromCache: false };
    }

    // 1. Cache em memória ainda válido → responde na hora, sem rede.
    if (!force) {
      const cached = _memoryCache.get(key);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return { ok: true, data: cached.data, error: null, stale: false, fromCache: true };
      }
    }

    _status[key] = 'loading';
    _emit({ type: 'loading', key, label: DATASET_LABELS[key] });

    try {
      const response = await fetch(SHEET_URLS[key], { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao buscar "${DATASET_LABELS[key]}"`);
      }

      const csvText = await response.text();
      if (!csvText || !csvText.trim()) {
        throw new Error(`Resposta vazia da base "${DATASET_LABELS[key]}"`);
      }

      const rows = _parseCSV(csvText);
      if (rows.length === 0) {
        throw new Error(`CSV sem linhas de dados para "${DATASET_LABELS[key]}"`);
      }

      const data = _mapRows(key, rows, FIELD_MAPS[key]);

      _memoryCache.set(key, { data, timestamp: Date.now() });
      _saveLocalCache(key, data);
      _status[key] = 'success';
      _lastUpdated[key] = new Date();
      _lastError[key] = null;

      _emit({ type: 'success', key, label: DATASET_LABELS[key], data, count: data.length });
      return { ok: true, data, error: null, stale: false, fromCache: false };

    } catch (err) {
      console.error(`[GoogleSheets] Falha ao carregar "${key}":`, err);
      const friendlyMessage = FRIENDLY_ERRORS[key] || 'Não foi possível carregar os dados desta base.';
      _status[key] = 'error';
      _lastError[key] = friendlyMessage;

      // Fallback: tenta usar o último cache local válido, mesmo que antigo,
      // para a interface continuar funcional em caso de indisponibilidade.
      const stale = _loadLocalCache(key);
      const fallbackData = stale ? stale.data : [];

      _emit({
        type: 'error', key, label: DATASET_LABELS[key],
        message: friendlyMessage, hasStaleData: !!stale,
        staleTimestamp: stale ? stale.timestamp : null,
      });

      return { ok: false, data: fallbackData, error: friendlyMessage, stale: !!stale, fromCache: false };
    }
  }

  /** Busca as admissões. Ver contrato de retorno em _fetchDataset. */
  function fetchAdmissoes(opts) { return _fetchDataset('admissoes', opts); }

  /** Busca os desligamentos. Ver contrato de retorno em _fetchDataset. */
  function fetchDesligamentos(opts) { return _fetchDataset('desligamentos', opts); }

  /** Busca o headcount por loja. Ver contrato de retorno em _fetchDataset. */
  function fetchHeadcountPorLoja(opts) { return _fetchDataset('lojas', opts); }

  /** Busca as férias previstas/em usufruto. Ver contrato de retorno em _fetchDataset. */
  function fetchFerias(opts) { return _fetchDataset('ferias', opts); }

  /** Busca os registros de quebra de caixa. Ver contrato de retorno em _fetchDataset. */
  function fetchQuebraCaixa(opts) { return _fetchDataset('quebraCaixa', opts); }

  /**
   * O módulo de Controle de Rescisões ainda não possui uma base própria
   * publicada. Mantido aqui (isolado, junto das demais fontes de dados)
   * para que, quando a planilha existir, baste adicionar a URL em
   * SHEET_URLS.rescisoes e implementar o mapeamento — nenhum outro arquivo
   * do sistema precisará mudar.
   */
  async function fetchRescisoes() {
    return { ok: false, data: [], error: 'Este módulo ainda não possui uma base de dados própria configurada.', stale: false, fromCache: false };
  }

  /** Busca as três bases em paralelo. Usado na carga inicial e no botão "Atualizar Dados". */
  async function fetchAll(opts) {
    const [admissoes, desligamentos, lojas] = await Promise.all([
      fetchAdmissoes(opts),
      fetchDesligamentos(opts),
      fetchHeadcountPorLoja(opts),
    ]);
    return { admissoes, desligamentos, lojas };
  }

  /** Força uma releitura de todas as bases, ignorando o cache — usado pelo botão "Atualizar Dados". */
  function refreshAll() {
    return fetchAll({ force: true });
  }


  /* ==========================================================================
   * 8. GETTERS DE STATUS (para a UI montar indicadores sem duplicar lógica)
   * ======================================================================== */

  function getStatus(key) { return key ? _status[key] : { ..._status }; }
  function getLastUpdated(key) { return key ? _lastUpdated[key] : { ..._lastUpdated }; }
  function getLastError(key) { return key ? _lastError[key] : { ..._lastError }; }

  /** Status agregado das 3 bases, útil para um único indicador global (ex: dot na sidebar). */
  function getOverallStatus() {
    const values = Object.values(_status);
    if (values.some((s) => s === 'loading')) return 'loading';
    if (values.every((s) => s === 'success')) return 'success';
    if (values.some((s) => s === 'success') && values.some((s) => s === 'error')) return 'partial';
    if (values.every((s) => s === 'idle')) return 'idle';
    return 'error';
  }

  return {
    fetchAdmissoes,
    fetchDesligamentos,
    fetchHeadcountPorLoja,
    fetchRescisoes,
    fetchFerias,
    fetchQuebraCaixa,
    fetchAll,
    refreshAll,
    clearCache,
    subscribe,
    getStatus,
    getLastUpdated,
    getLastError,
    getOverallStatus,
    datasetLabels: DATASET_LABELS,
  };
})();

window.GoogleSheets = GoogleSheets;
