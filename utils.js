/* ============================================================================
   UTILS.JS
   ----------------------------------------------------------------------------
   Funções utilitárias genéricas, sem dependência de nenhum outro módulo.
   A maior parte é pura (não manipula estado global da aplicação) e pode ser
   reaproveitada por qualquer módulo futuro (Férias, Turnover, etc.).
   Exposto em window.Utils para uso simples via <script> sem bundler.

   Seções deste arquivo:
     - DOM helpers (qs, qsa, el, cloneTemplate, emptyNode)
     - Formatação de dados (número, moeda, percentual, data)
     - Controle de fluxo (debounce, uid)
     - Coleções (uniqueValues, groupBy, normalize, filterByBusca)
     - Persistência local (storageGet/storageSet) — usada para lembrar os
       filtros do usuário entre sessões (ver script.js).
     - Notificações "toast" — feedback rápido de ações (dados atualizados,
       exportação concluída, erros), sem acoplamento com nenhum módulo.
     - Exportação de tabelas para Excel (.xls) e PDF (via impressão do
       navegador), 100% JavaScript puro — sem nenhuma biblioteca externa.
   ============================================================================ */

const Utils = (() => {

  /* --------------------------------------------------------------------
   * DOM helpers
   * ------------------------------------------------------------------ */

  /** Atalho para document.querySelector */
  function qs(selector, scope = document) {
    return scope.querySelector(selector);
  }

  /** Atalho para document.querySelectorAll, já retornando um Array */
  function qsa(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
  }

  /**
   * Cria um elemento DOM a partir de uma tag e propriedades/atributos.
   * Ex: el('div', { class: 'card', text: 'Olá' }, [child1, child2])
   */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'text') {
        node.textContent = value;
      } else if (key === 'html') {
        node.innerHTML = value;
      } else if (key === 'class') {
        node.className = value;
      } else if (key.startsWith('data-')) {
        node.setAttribute(key, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.substring(2).toLowerCase(), value);
      } else {
        node.setAttribute(key, value);
      }
    });
    children.forEach((child) => {
      if (child) node.appendChild(child);
    });
    return node;
  }

  /** Clona o conteúdo de um <template> por id e retorna o fragmento pronto para uso */
  function cloneTemplate(templateId) {
    const tpl = document.getElementById(templateId);
    if (!tpl) {
      console.warn(`[Utils] Template "${templateId}" não encontrado.`);
      return null;
    }
    return tpl.content.cloneNode(true);
  }

  /** Remove todos os filhos de um elemento (mais rápido que innerHTML = '') */
  function emptyNode(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }


  /* --------------------------------------------------------------------
   * Formatação de dados
   * ------------------------------------------------------------------ */

  /** Formata número inteiro no padrão pt-BR (ex: 1234 -> "1.234") */
  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('pt-BR').format(value);
  }

  /** Formata valor monetário em Real (ex: 1234.5 -> "R$ 1.234,50") */
  function formatCurrency(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  /** Formata percentual (ex: 0.125 -> "12,5%"); passe já multiplicado se necessário */
  function formatPercent(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${value.toFixed(digits).replace('.', ',')}%`;
  }

  /** Formata data (Date | string ISO | número serial) para dd/mm/aaaa */
  function formatDate(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR').format(date);
  }

  /** Formata data e hora para exibição em "última atualização" */
  function formatDateTime(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  /**
   * Formata um valor em HORAS DECIMAIS (ex: 7.5, -2.95) como "HH:MM" (ex: "07:30",
   * "-02:57"), preservando o sinal. Usado pelo Banco de Horas — não confundir com
   * data/hora do relógio; o valor de entrada já vem em horas decimais (ver
   * _parseHorasDecimais em googleSheets.js). Conversão só na apresentação, para
   * não perder precisão nos cálculos.
   */
  function formatHoras(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const sign = value < 0 ? '-' : '';
    const totalMinutes = Math.round(Math.abs(value) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /** Converte "JAN".."DEZ" (formato usado na base) para número do mês (1-12) */
  const MONTH_MAP = {
    JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
    JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12
  };
  function monthAbbrToNumber(abbr) {
    if (!abbr) return null;
    return MONTH_MAP[String(abbr).trim().toUpperCase()] ?? null;
  }


  /* --------------------------------------------------------------------
   * Controle de fluxo
   * ------------------------------------------------------------------ */

  /** Debounce clássico — atrasa a execução até `wait` ms sem novas chamadas */
  function debounce(fn, wait = 250) {
    let timeoutId;
    return function debounced(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /** Gera um id curto (uso em elementos dinâmicos, não é criptográfico) */
  function uid(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }


  /* --------------------------------------------------------------------
   * Coleções (usados por filters.js / charts.js futuramente)
   * ------------------------------------------------------------------ */

  /** Retorna valores únicos de um array de objetos para uma dada chave, ordenados */
  function uniqueValues(list, key) {
    const set = new Set(list.map((item) => item[key]).filter((v) => v !== undefined && v !== null && v !== ''));
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }

  /** Agrupa um array de objetos pelo valor de uma chave */
  function groupBy(list, key) {
    return list.reduce((acc, item) => {
      const groupKey = item[key];
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(item);
      return acc;
    }, {});
  }

  /**
   * Normaliza uma string para comparação "solta": minúsculas e sem acentos.
   * Usado na busca por colaborador (filtro de texto), para que "jose" encontre
   * "José" e "JOSÉ" independentemente de caixa/acentuação.
   */
  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Filtro de "busca instantânea" genérico: retorna somente os itens de `list`
   * em que ALGUM dos campos de `fields` contém o termo digitado (tolerante a
   * acento/caixa via normalize()). Usado por todos os módulos que têm um campo
   * de busca por texto (Colaborador), para não duplicar a mesma lógica em
   * cada módulo — ver script.js.
   * Se `term` for vazio, devolve a lista original sem filtrar.
   */
  function filterByBusca(list, term, fields) {
    const trimmed = String(term || '').trim();
    if (!trimmed) return list;
    const alvo = normalize(trimmed);
    return list.filter((item) => fields.some((field) => normalize(item[field]).includes(alvo)));
  }


  /* --------------------------------------------------------------------
   * Persistência local (localStorage), com fallback seguro
   * ------------------------------------------------------------------ */

  /** Lê e faz parse de uma chave do localStorage; devolve `fallback` se não existir ou falhar. */
  function storageGet(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Utils] Não foi possível ler "${key}" do localStorage:`, err.message);
      return fallback;
    }
  }

  /** Grava um valor (serializado em JSON) no localStorage. Nunca lança exceção. */
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[Utils] Não foi possível gravar "${key}" no localStorage:`, err.message);
      return false;
    }
  }


  /* --------------------------------------------------------------------
   * Notificações (toast) — feedback rápido e não bloqueante de ações
   * (ex: "Dados atualizados", "Exportação concluída", erros inesperados).
   * Reaproveitável por qualquer módulo, sem estado próprio no chamador.
   * ------------------------------------------------------------------ */
  function _toastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = el('div', { id: 'toastContainer', class: 'toast-container', 'aria-live': 'polite' });
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Exibe uma notificação temporária no canto da tela.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} variant
   * @param {number} duration - ms até desaparecer sozinha (0 = não some sozinha)
   */
  function toast(message, variant = 'info', duration = 4200) {
    const container = _toastContainer();
    const item = el('div', { class: `toast toast--${variant}` }, [
      el('span', { class: 'toast__text', text: message }),
    ]);
    const closeBtn = el('button', { class: 'toast__close', type: 'button', 'aria-label': 'Fechar aviso', text: '×' });
    closeBtn.addEventListener('click', () => _dismissToast(item));
    item.appendChild(closeBtn);
    container.appendChild(item);

    if (duration > 0) {
      setTimeout(() => _dismissToast(item), duration);
    }
    return item;
  }

  function _dismissToast(item) {
    if (!item || !item.isConnected) return;
    item.classList.add('toast--leaving');
    setTimeout(() => item.remove(), 220);
  }


  /* --------------------------------------------------------------------
   * Exportação de tabelas (Excel / PDF) — sem bibliotecas externas
   * ------------------------------------------------------------------
   * Excel: gera um arquivo .xls a partir de uma tabela HTML simples (truque
   * suportado nativamente pelo Excel/Google Sheets ao abrir o arquivo,
   * sem precisar de nenhuma biblioteca de terceiros).
   * PDF: abre uma janela de impressão com a tabela formatada; o usuário usa
   * a opção "Salvar como PDF" do diálogo de impressão do navegador — mesma
   * técnica usada por diversos sistemas corporativos que não têm backend.
   * ------------------------------------------------------------------ */

  function _escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _slugFilename(name) {
    return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'exportacao';
  }

  /** Monta o HTML de uma tabela simples a partir de colunas + linhas (arrays de strings já formatadas). */
  function _buildExportTableHtml({ columns, rows }) {
    const thead = `<tr>${columns.map((c) => `<th>${_escapeHtml(c)}</th>`).join('')}</tr>`;
    const tbody = rows.map((r) => `<tr>${r.map((cell) => `<td>${_escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
    return `<table border="1"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  }

  /**
   * Exporta para um arquivo .xls (abre direto no Excel/Google Sheets).
   * @param {{ filename: string, columns: string[], rows: Array<string[]> }} opts
   */
  function exportToExcel({ filename, columns, rows }) {
    const tableHtml = _buildExportTableHtml({ columns, rows });
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${tableHtml}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `${_slugFilename(filename)}.xls` });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Exporta para PDF via diálogo de impressão do navegador (sem biblioteca externa):
   * abre uma janela nova só com a tabela formatada e chama print() automaticamente.
   * @param {{ title: string, columns: string[], rows: Array<string[]> }} opts
   */
  function exportToPDF({ title, columns, rows }) {
    const tableHtml = _buildExportTableHtml({ columns, rows });
    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) {
      toast('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.', 'error');
      return;
    }
    win.document.write(`
      <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${_escapeHtml(title)}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 24px; }
        h1 { font-size: 16px; margin: 0 0 4px; }
        .meta { font-size: 11px; color: #666; margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        th { background: #f2f2f2; text-transform: uppercase; font-size: 10px; }
        tbody tr:nth-child(even) { background: #fafafa; }
      </style></head><body>
      <h1>${_escapeHtml(title)}</h1>
      <div class="meta">Portal de RH — Rede de Farmácias · Exportado em ${_escapeHtml(formatDateTime(new Date()))} · ${rows.length} registro(s)</div>
      ${tableHtml}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  }

  return {
    qs, qsa, el, cloneTemplate, emptyNode,
    formatNumber, formatCurrency, formatPercent, formatDate, formatDateTime, formatHoras, monthAbbrToNumber,
    debounce, uid,
    uniqueValues, groupBy, normalize, filterByBusca,
    storageGet, storageSet,
    toast,
    exportToExcel, exportToPDF,
  };
})();

// Disponibiliza globalmente para os demais scripts (carregados via <script> simples, sem bundler)
window.Utils = Utils;
