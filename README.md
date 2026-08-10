# Componentes — Portal de RH

Como o projeto é **HTML/CSS/JS puro** (sem React/Vue/build step), os
"componentes" reais do sistema são funções JavaScript em `js/script.js`
(`kpiCard()`, `chartGrid()`, `tableCard()`, `sectionHeader()` etc.) que geram
os elementos dinamicamente — isso evita duplicar HTML entre módulos.

Os arquivos `.html` desta pasta **não são carregados pela aplicação**. Eles
existem como **referência visual estática** de cada componente, para consulta
rápida de marcação/classes CSS ao criar um módulo novo (ex: copiar a estrutura
de um card de KPI ao montar o módulo de Turnover).

## Arquivos de referência

| Arquivo | Componente | Função JS equivalente |
|---|---|---|
| `kpi-card.html` | Card de indicador (KPI) | `kpiCard()` em `script.js` |
| `filter-bar.html` | Barra de filtros | `Filters.createFilterBar()` em `filters.js` |
| `module-template.html` | Esqueleto de um módulo novo | — (ponto de partida) |

## Como criar um módulo novo

1. Adicione um registro em `MODULE_REGISTRY` (topo de `js/script.js`) com
   `status: 'active'` e uma função `render`.
2. Escreva a função `renderNomeDoModulo(container)` seguindo o padrão dos
   módulos existentes (`renderDashboard`, `renderAdmissoes`, ...): cabeçalho
   de filtros → cards de KPI → gráficos → tabela.
3. Se o módulo precisar de dados próprios, adicione uma função
   `fetchNomeDoModulo()` em `js/googleSheets.js`, seguindo o mesmo contrato
   (retorna `Promise<Array<Object>>`).
4. Nenhuma alteração é necessária em `index.html` nem em `css/style.css` —
   as classes já existentes (`.kpi-card`, `.chart-card`, `.table-card`, ...)
   cobrem qualquer novo módulo.
