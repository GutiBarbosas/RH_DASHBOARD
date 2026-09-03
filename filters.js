/* ============================================================================
   FILTERS.JS
   ----------------------------------------------------------------------------
   Motor de filtros genérico e reutilizável. Não conhece nenhum módulo
   específico — recebe uma definição de campos e uma fonte de dados, e
   devolve elementos DOM + uma API para ler/alterar o estado dos filtros.
   Pensado para funcionar com qualquer dataset futuro (Férias, Turnover, etc.)
   desde que os itens sejam objetos simples (arrays de objetos).
   ============================================================================ */

const Filters = (() => {

  /**
   * Cria uma barra de filtros dentro do container informado.
   *
   * @param {HTMLElement} container - elemento onde a barra será renderizada
   * @param {Array<{key: string, label: string, type?: 'select'|'date', options?: string[]}>} fieldsDef
   * @param {Function} onChange - callback(currentFilterState) disparado a cada alteração
   * @returns {{ getState: Function, setOptions: Function, reset: Function, el: HTMLElement }}
   */
  function createFilterBar(container, fieldsDef, onChange) {
    const state = {};
    const bar = Utils.el('div', { class: 'filter-bar' });
    const fieldEls = {};

    fieldsDef.forEach((field) => {
      state[field.key] = '';

      const label = Utils.el('label', { class: 'filter-field__label', text: field.label });
      let input;

      if (field.type === 'date') {
        input = Utils.el('input', { type: 'date' });
      } else if (field.type === 'text') {
        input = Utils.el('input', { type: 'text', placeholder: field.placeholder || 'Buscar…', autocomplete: 'off' });
      } else {
        input = Utils.el('select', {}, [
          Utils.el('option', { value: '', text: field.placeholder || 'Todos' }),
        ]);
        (field.options || []).forEach((opt) => {
          input.appendChild(Utils.el('option', { value: opt, text: opt }));
        });
      }

      input.id = `filter-${field.key}`;
      label.htmlFor = input.id;

      if (field.type === 'text') {
        // Campo de texto: dispara com um pequeno atraso enquanto o usuário digita
        // (busca "instantânea"), em vez de esperar o campo perder o foco.
        // Atraso configurável por campo (field.debounce); 200ms por padrão —
        // rápido o suficiente para parecer instantâneo, sem recalcular a cada tecla.
        const debounced = Utils.debounce(() => {
          state[field.key] = input.value;
          onChange({ ...state });
        }, field.debounce ?? 200);
        input.addEventListener('input', debounced);
      } else {
        input.addEventListener('change', () => {
          state[field.key] = input.value;
          onChange({ ...state });
        });
      }

      const wrap = Utils.el('div', { class: 'filter-field' }, [label, input]);
      bar.appendChild(wrap);
      fieldEls[field.key] = input;
    });

    // Ações (limpar filtros / exportar — exportação é placeholder para módulos futuros)
    const actions = Utils.el('div', { class: 'filter-bar__actions' });
    const clearBtn = Utils.el('button', { class: 'btn', type: 'button' }, [
      iconSvg('M4 4L20 20M20 4L4 20'),
      Utils.el('span', { text: 'Limpar filtros' }),
    ]);
    clearBtn.addEventListener('click', () => {
      Object.keys(fieldEls).forEach((key) => {
        fieldEls[key].value = '';
        state[key] = '';
      });
      onChange({ ...state });
    });
    actions.appendChild(clearBtn);
    bar.appendChild(actions);

    container.appendChild(bar);

    return {
      el: bar,
      getState: () => ({ ...state }),
      setOptions: (key, options) => {
        const select = fieldEls[key];
        if (!select || select.tagName !== 'SELECT') return;
        const current = select.value;
        Utils.emptyNode(select);
        select.appendChild(Utils.el('option', { value: '', text: 'Todos' }));
        options.forEach((opt) => select.appendChild(Utils.el('option', { value: opt, text: opt })));
        select.value = options.includes(current) ? current : '';
      },
      /**
       * Restaura valores de filtro programaticamente (ex: após recarregar dados
       * e reconstruir a view) SEM disparar o callback onChange — evita loops e
       * permite ao chamador decidir quando recalcular o conteúdo.
       */
      setState: (partialState = {}) => {
        Object.keys(partialState).forEach((key) => {
          const input = fieldEls[key];
          const value = partialState[key];
          if (!input || value === undefined || value === null) return;
          // Só aplica se a opção ainda existir (evita "travar" um valor órfão)
          if (input.tagName === 'SELECT') {
            const hasOption = Array.from(input.options).some((o) => o.value === value);
            if (!hasOption) return;
          }
          input.value = value;
          state[key] = value;
        });
      },
      reset: () => clearBtn.click(),
    };
  }

  /**
   * Aplica um conjunto de filtros (objeto chave/valor) a uma lista de objetos.
   * Uma chave com valor vazio ('') é ignorada (equivale a "Todos").
   *
   * @param {Array<Object>} list
   * @param {Object} filterState
   * @returns {Array<Object>}
   */
  function applyFilters(list, filterState) {
    const activeKeys = Object.keys(filterState).filter((k) => filterState[k] !== '' && filterState[k] != null);
    if (activeKeys.length === 0) return list;

    return list.filter((item) =>
      activeKeys.every((key) => String(item[key]) === String(filterState[key]))
    );
  }

  function iconSvg(pathD) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    return svg;
  }

  return {
    createFilterBar,
    applyFilters,
  };
})();

window.Filters = Filters;
