/* ============================================================================
   CHARTS.JS
   ----------------------------------------------------------------------------
   Camada responsável pela renderização de gráficos.
   Nesta etapa do projeto, NENHUM gráfico é desenhado ainda (conforme
   escopo solicitado) — apenas o "esqueleto" visual (placeholder) é montado.

   Quando os gráficos forem habilitados, cada módulo (script.js) continuará
   chamando as mesmas funções (ex: Charts.renderBarChart), bastando trocar
   a implementação interna para usar o Chart.js (já carregado via CDN em
   index.html) sem precisar alterar os módulos que os consomem.
   ============================================================================ */

const Charts = (() => {

  // Guarda instâncias de gráficos ativos por id de canvas, para permitir
  // destruir/recriar ao trocar de filtro (padrão exigido pelo Chart.js).
  const _instances = new Map();

  /**
   * Renderiza o placeholder visual de um gráfico dentro de um container.
   * Usado hoje no lugar de todo gráfico real, para deixar a área reservada
   * e comunicar claramente que a integração de dados ainda está pendente.
   *
   * @param {HTMLElement} container
   * @param {{ title: string }} options
   */
  function renderPlaceholder(container, { title }) {
    const frag = Utils.cloneTemplate('tpl-chart-placeholder');
    if (!frag) return;
    Utils.qs('.chart-card__title', frag).textContent = title;
    container.appendChild(frag);
  }

  /* --------------------------------------------------------------------
   * Funções preparadas para a fase de integração (não utilizadas ainda)
   * ------------------------------------------------------------------ *
   * Mantidas aqui como contrato estável para os módulos futuros
   * (Turnover, Absenteísmo, Indicadores do CD etc.), que já poderão
   * chamar essas funções assim que os dados estiverem disponíveis.
   * ------------------------------------------------------------------ */

  /**
   * Cria (ou recria) um gráfico de barras.
   * @param {string} canvasId - id do elemento <canvas>
   * @param {{ labels: string[], datasets: Array<{label: string, data: number[]}> }} data
   * @param {Object} [options] - opções adicionais do Chart.js
   */
  function renderBarChart(canvasId, data, options = {}) {
    if (typeof Chart === 'undefined') {
      console.warn('[Charts] Chart.js ainda não foi carregado.');
      return null;
    }
    _destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const instance = new Chart(ctx, {
      type: 'bar',
      data,
      options: _mergeDefaultOptions(options),
    });
    _instances.set(canvasId, instance);
    return instance;
  }

  /**
   * Cria (ou recria) um gráfico de linha (útil para séries temporais:
   * admissões/desligamentos por mês, turnover ao longo do tempo, etc.)
   */
  function renderLineChart(canvasId, data, options = {}) {
    if (typeof Chart === 'undefined') {
      console.warn('[Charts] Chart.js ainda não foi carregado.');
      return null;
    }
    _destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const instance = new Chart(ctx, {
      type: 'line',
      data,
      options: _mergeDefaultOptions(options),
    });
    _instances.set(canvasId, instance);
    return instance;
  }

  /**
   * Cria (ou recria) um gráfico de rosca (donut) — útil para composição
   * (ex: tipos de aviso de desligamento, status de admissão).
   */
  function renderDonutChart(canvasId, data, options = {}) {
    if (typeof Chart === 'undefined') {
      console.warn('[Charts] Chart.js ainda não foi carregado.');
      return null;
    }
    _destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const instance = new Chart(ctx, {
      type: 'doughnut',
      data,
      options: _mergeDefaultOptions(options, { cutout: '68%' }),
    });
    _instances.set(canvasId, instance);
    return instance;
  }

  function _destroyIfExists(canvasId) {
    if (_instances.has(canvasId)) {
      _instances.get(canvasId).destroy();
      _instances.delete(canvasId);
    }
  }

  /** Paleta padrão do Portal RH, para manter os gráficos consistentes com o tema dark */
  const PALETTE = ['#5B8DEF', '#C9A15A', '#4CAF7D', '#E0616B', '#D9A441', '#6B7684'];

  function _mergeDefaultOptions(userOptions, extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#97A2B0', font: { family: 'Inter', size: 11.5 } },
        },
      },
      scales: userOptions.scales || {
        x: { ticks: { color: '#616D7C' }, grid: { color: '#1A2029' } },
        y: { ticks: { color: '#616D7C' }, grid: { color: '#1A2029' } },
      },
      ...extra,
      ...userOptions,
    };
  }

  return {
    renderPlaceholder,
    renderBarChart,
    renderLineChart,
    renderDonutChart,
    PALETTE,
  };
})();

window.Charts = Charts;
