/**
 * ============================================================================
 * SAMA - Sistema Autônomo de Monitoramento Ambiental (Lagoa da Chapadinha)
 * VISÃO PÚBLICA (Cidadão) - public.js
 *
 * Módulo isolado (IIFE) sem vazamento de escopo global.
 * Implementa a Lógica Semafórica de Pior Cenário, renderizador nativo em Canvas
 * para histórico de 30 dias e interatividade completa com o mapa cartográfico.
 * ============================================================================
 */
(function () {
  'use strict';

  // 1. Constantes e Limiares Normativos (Resolução CONAMA 357 / Águas Doces Classe 2)
  const THRESHOLDS = {
    ph: { min: 6.0, max: 9.0, criticalMin: 5.0, criticalMax: 9.5, unit: '' },
    turbidity: { idealMax: 25.0, criticalMax: 40.0, unit: 'NTU' },
    eColi: { idealMax: 250, criticalMax: 1000, unit: 'NMP/100mL' },
    dissolvedOxygen: { idealMin: 5.0, criticalMin: 4.0, unit: 'mg/L' },
    totalPhosphorus: { idealMax: 0.03, criticalMax: 0.05, unit: 'mg/L' }
  };

  // Chaves de armazenamento
  const STORAGE_KEY_POINTS = 'SAMA_MONITORAMENTO_DB';

  // 2. Base de Dados Inicial dos Pontos de Monitoramento da Lagoa da Chapadinha
  // Cada ponto possui coordenadas cartográficas relativas (% na imagem) e dados hidrológicos
  const INITIAL_POINTS = [
    {
      id: 'P1',
      code: 'P1',
      name: 'Foz Norte / Cabeceira da Lagoa',
      coordsDesc: '10°04\'28\'\' S, 44°17\'52\'\' W',
      xPercent: 33.0, // Cabeceira da lâmina d'água ao norte
      yPercent: 12.0,
      lastUpdate: 'Hoje, 09:30',
      operator: 'Bióloga Marina Costa (SAMA)',
      current: {
        ph: 7.30,               // pH IDEAL (6.0 - 9.0)
        turbidity: 58.0,        // FÍSICO FORA DO PADRÃO (> 40 NTU) -> FORÇA VERMELHO
        eColi: 1450,            // BIOLÓGICO FORA DO PADRÃO (> 1000 NMP) -> FORÇA VERMELHO
        dissolvedOxygen: 3.4,   // QUÍMICO CRÍTICO (< 4.0 mg/L)
        waterTemp: 26.5,
        airTemp: 29.8,
        totalPhosphorus: 0.082
      },
      history30d: generate30DayHistory({
        basePh: 7.25, varPh: 0.2,
        baseTurbidity: 48, varTurbidity: 18,
        baseEColi: 1200, varEColi: 350,
        baseOD: 3.8, varOD: 0.6
      })
    },
    {
      id: 'P2',
      code: 'P2',
      name: 'Orla Leste / Parque Regina Freire',
      coordsDesc: '10°04\'42\'\' S, 44°17\'30\'\' W',
      xPercent: 64.0, // Próximo às tendas e área de eventos do Parque Regina Freire
      yPercent: 35.0,
      lastUpdate: 'Hoje, 08:45',
      operator: 'Eng. Renato Salles (SAMA)',
      current: {
        ph: 6.85,               // pH Ideal
        turbidity: 32.0,        // Físico em Atenção (25 a 40 NTU) -> AMARELO
        eColi: 650,             // Biológico em Atenção (250 a 1000 NMP) -> AMARELO
        dissolvedOxygen: 4.8,   // OD em Atenção (4.0 a 5.0 mg/L)
        waterTemp: 25.8,
        airTemp: 28.5,
        totalPhosphorus: 0.038
      },
      history30d: generate30DayHistory({
        basePh: 6.9, varPh: 0.2,
        baseTurbidity: 30, varTurbidity: 8,
        baseEColi: 600, varEColi: 180,
        baseOD: 4.9, varOD: 0.5
      })
    },
    {
      id: 'P3',
      code: 'P3',
      name: 'Lâmina Central / Águas Abertas',
      coordsDesc: '10°04\'50\'\' S, 44°17\'42\'\' W',
      xPercent: 44.0, // Centro da lâmina de água
      yPercent: 46.0,
      lastUpdate: 'Hoje, 10:15',
      operator: 'Téc. Carlos Eduardo (SAMA)',
      current: {
        ph: 7.20,               // pH Ideal
        turbidity: 12.5,        // Turbidez Ideal (< 25 NTU)
        eColi: 110,             // E. coli Ideal (< 250 NMP)
        dissolvedOxygen: 6.8,   // OD Ideal (>= 5.0 mg/L)
        waterTemp: 24.5,
        airTemp: 28.0,
        totalPhosphorus: 0.018
      },
      history30d: generate30DayHistory({
        basePh: 7.2, varPh: 0.15,
        baseTurbidity: 14, varTurbidity: 4,
        baseEColi: 130, varEColi: 40,
        baseOD: 6.7, varOD: 0.4
      })
    },
    {
      id: 'P4',
      code: 'P4',
      name: 'Margem Oeste / Orla Urbana',
      coordsDesc: '10°04\'58\'\' S, 44°17\'55\'\' W',
      xPercent: 30.0, // Margem residencial / pista oeste
      yPercent: 58.0,
      lastUpdate: 'Hoje, 09:10',
      operator: 'Bióloga Marina Costa (SAMA)',
      current: {
        ph: 7.40,               // pH Ideal (7.4)
        turbidity: 68.0,        // Turbidez Alta por erosão da margem (> 40 NTU) -> FORÇA VERMELHO
        eColi: 1850,            // E. coli altíssima (> 1000 NMP) -> FORÇA VERMELHO
        dissolvedOxygen: 3.1,   // OD crítico
        waterTemp: 27.2,
        airTemp: 30.1,
        totalPhosphorus: 0.095
      },
      history30d: generate30DayHistory({
        basePh: 7.4, varPh: 0.25,
        baseTurbidity: 62, varTurbidity: 12,
        baseEColi: 1700, varEColi: 400,
        baseOD: 3.3, varOD: 0.5
      })
    },
    {
      id: 'P5',
      code: 'P5',
      name: 'Vertedouro Sul / Zona de Macrófitas',
      coordsDesc: '10°05\'15\'\' S, 44°17\'35\'\' W',
      xPercent: 58.0, // Extremidade sul da lagoa
      yPercent: 82.0,
      lastUpdate: 'Hoje, 08:00',
      operator: 'Eng. Renato Salles (SAMA)',
      current: {
        ph: 7.10,               // pH Ideal
        turbidity: 9.8,         // Ideal
        eColi: 80,              // Ideal
        dissolvedOxygen: 7.2,   // Excelente
        waterTemp: 24.1,
        airTemp: 27.5,
        totalPhosphorus: 0.012
      },
      history30d: generate30DayHistory({
        basePh: 7.1, varPh: 0.1,
        baseTurbidity: 10, varTurbidity: 3,
        baseEColi: 95, varEColi: 30,
        baseOD: 7.1, varOD: 0.3
      })
    }
  ];

  /**
   * Gerador determinístico de histórico de 30 dias para testes e demonstração
   */
  function generate30DayHistory(cfg) {
    const list = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      // Variação suave pseudo-aleatória
      const factor = Math.sin(i * 0.4) * 0.5 + (Math.random() - 0.5) * 0.5;
      
      list.push({
        date: dayLabel,
        dayOffset: i,
        ph: Number((cfg.basePh + factor * cfg.varPh).toFixed(2)),
        turbidity: Number(Math.max(1, cfg.baseTurbidity + factor * cfg.varTurbidity).toFixed(1)),
        eColi: Math.round(Math.max(10, cfg.baseEColi + factor * cfg.varEColi)),
        od: Number(Math.max(1, cfg.baseOD - factor * cfg.varOD).toFixed(1))
      });
    }
    return list;
  }

  // 3. REGRA DE NEGÓCIO CRUCIAL: Avaliação do Pior Cenário (Worst-Case Scenario)
  /**
   * Avalia a qualidade da água segundo a regra estrita do pior cenário:
   * Mesmo que o pH esteja perfeito (6.0 a 9.0), se parâmetros biológicos
   * (E. coli > 1000) ou físicos (Turbidez > 40) forem violados, o status
   * É OBRIGATORIAMENTE VERMELHO (Crítico).
   *
   * @param {Object} p Parâmetros da amostra
   * @returns {Object} Classificação, badge, explicação e lista de não-conformidades
   */
  function evaluateWorstCaseStatus(p) {
    const criticalViolations = [];
    const warningViolations = [];

    // --- A. Parâmetro Químico: pH ---
    let phStatus = 'green';
    if (p.ph < THRESHOLDS.ph.criticalMin || p.ph > THRESHOLDS.ph.criticalMax) {
      criticalViolations.push(`pH fora do padrão severo (${p.ph.toFixed(2)})`);
      phStatus = 'red';
    } else if (p.ph < THRESHOLDS.ph.min || p.ph > THRESHOLDS.ph.max) {
      warningViolations.push(`pH em desvio moderado (${p.ph.toFixed(2)})`);
      phStatus = 'yellow';
    }

    // --- B. Parâmetro Biológico: E. coli (Crucial para Balneabilidade) ---
    let bioStatus = 'green';
    if (p.eColi > THRESHOLDS.eColi.criticalMax) {
      criticalViolations.push(`Contaminação Biológica Severa: E. coli (${p.eColi} NMP/100mL > limite máx. de 1.000)`);
      bioStatus = 'red';
    } else if (p.eColi > THRESHOLDS.eColi.idealMax) {
      warningViolations.push(`E. coli em Alerta (${p.eColi} NMP/100mL)`);
      bioStatus = 'yellow';
    }

    // --- C. Parâmetro Físico: Turbidez ---
    let physicalStatus = 'green';
    if (p.turbidity > THRESHOLDS.turbidity.criticalMax) {
      criticalViolations.push(`Turbidez Crítica (${p.turbidity.toFixed(1)} NTU > limite de 40.0)`);
      physicalStatus = 'red';
    } else if (p.turbidity > THRESHOLDS.turbidity.idealMax) {
      warningViolations.push(`Turbidez Elevada (${p.turbidity.toFixed(1)} NTU)`);
      physicalStatus = 'yellow';
    }

    // --- D. Parâmetro Químico: Oxigênio Dissolvido (OD) ---
    let odStatus = 'green';
    if (p.dissolvedOxygen < THRESHOLDS.dissolvedOxygen.criticalMin) {
      criticalViolations.push(`Oxigênio Dissolvido Crítico (${p.dissolvedOxygen.toFixed(1)} mg/L < 4.0 mg/L)`);
      odStatus = 'red';
    } else if (p.dissolvedOxygen < THRESHOLDS.dissolvedOxygen.idealMin) {
      warningViolations.push(`Oxigênio Dissolvido em Atenção (${p.dissolvedOxygen.toFixed(1)} mg/L)`);
      odStatus = 'yellow';
    }

    // --- Aplicação Estrita da Regra do Pior Cenário ---
    // Se QUALQUER parâmetro for Vermelho -> STATUS GERAL = VERMELHO
    if (criticalViolations.length > 0) {
      let rationaleText = '';
      if (phStatus === 'green') {
        rationaleText = `Apesar do pH estar na faixa ideal de conformidade (${p.ph.toFixed(2)}), este ponto foi classificado como CRÍTICO devido a desvios severos: ${criticalViolations.join('; ')}.`;
      } else {
        rationaleText = `Classificação Crítica por desconformidade regulatória: ${criticalViolations.join('; ')}.`;
      }

      return {
        level: 'red',
        badge: 'CRÍTICO',
        condition: 'Imprópria para Recreação e Consumo',
        color: '#ef4444',
        rationale: rationaleText,
        isWorstCaseTriggered: phStatus === 'green',
        criticalList: criticalViolations
      };
    }

    // Se houver parâmetros em Amarelo e nenhum Vermelho -> STATUS GERAL = AMARELO
    if (warningViolations.length > 0) {
      return {
        level: 'yellow',
        badge: 'ATENÇÃO',
        condition: 'Qualidade Tolerável - Requer Cautela',
        color: '#f59e0b',
        rationale: `Ponto sob alerta preventivo devido a: ${warningViolations.join('; ')}. Recomenda-se evitar ingestão acidental e contato prolongado.`,
        isWorstCaseTriggered: false,
        warningList: warningViolations
      };
    }

    // Todos os parâmetros atendem aos limites ideais -> STATUS GERAL = VERDE
    return {
      level: 'green',
      badge: 'IDEAL',
      condition: 'Própria para Recreação e Contato Primário',
      color: '#10b981',
      rationale: `Todos os parâmetros biológicos, físicos e químicos atendem rigorosamente aos limites da Resolução CONAMA 357 (Classe 2).`,
      isWorstCaseTriggered: false
    };
  }

  // 4. Estado da Aplicação
  const state = {
    points: [],
    selectedPoint: null,
    activeFilter: 'all',
    activeChartMetric: 'turbidity',
    zoomLevel: 1.0,
    panX: 0,
    panY: 0
  };

  // 5. Elementos DOM da Interface
  const DOM = {
    btnToggleDrawer: document.getElementById('btnToggleDrawer'),
    btnCloseDrawer: document.getElementById('btnCloseDrawer'),
    sideDrawer: document.getElementById('sideDrawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    drawerPointsList: document.getElementById('drawerPointsList'),
    filterButtons: document.querySelectorAll('.filter-btn'),
    pinsLayer: document.getElementById('pinsLayer'),
    mapCanvasWrapper: document.getElementById('mapCanvasWrapper'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnZoomReset: document.getElementById('btnZoomReset'),

    // KPIs do Drawer
    kpiTotalPoints: document.getElementById('kpiTotalPoints'),
    kpiIdealPoints: document.getElementById('kpiIdealPoints'),
    kpiWarningPoints: document.getElementById('kpiWarningPoints'),
    kpiCriticalPoints: document.getElementById('kpiCriticalPoints'),
    globalStatusPill: document.getElementById('globalStatusPill'),

    // Card Flutuante
    floatingCard: document.getElementById('floatingCard'),
    btnCloseCard: document.getElementById('btnCloseCard'),
    cardPointCode: document.getElementById('cardPointCode'),
    cardPointName: document.getElementById('cardPointName'),
    cardPointCoords: document.getElementById('cardPointCoords'),
    cardVerdictBox: document.getElementById('cardVerdictBox'),
    cardVerdictIcon: document.getElementById('cardVerdictIcon'),
    cardVerdictBadge: document.getElementById('cardVerdictBadge'),
    cardVerdictCondition: document.getElementById('cardVerdictCondition'),
    cardVerdictRationale: document.getElementById('cardVerdictRationale'),
    valPh: document.getElementById('valPh'),
    barPh: document.getElementById('barPh'),
    valTurbidity: document.getElementById('valTurbidity'),
    threshTurbidity: document.getElementById('threshTurbidity'),
    valEColi: document.getElementById('valEColi'),
    threshEColi: document.getElementById('threshEColi'),
    valOd: document.getElementById('valOd'),
    threshOd: document.getElementById('threshOd'),
    valTemp: document.getElementById('valTemp'),
    valPhosphorus: document.getElementById('valPhosphorus'),
    cardLastCollectionDate: document.getElementById('cardLastCollectionDate'),
    cardOperator: document.getElementById('cardOperator'),

    // Canvas & Mini-Gráfico
    miniTrendCanvas: document.getElementById('miniTrendCanvas'),
    chartTooltip: document.getElementById('chartTooltip'),
    chartMetricLabel: document.getElementById('chartMetricLabel'),
    chartTabs: document.querySelectorAll('.chart-tab'),
    chartStatMin: document.getElementById('chartStatMin'),
    chartStatAvg: document.getElementById('chartStatAvg'),
    chartStatMax: document.getElementById('chartStatMax'),
    chartStatLimit: document.getElementById('chartStatLimit')
  };

  // 6. Inicialização do Banco de Dados
  function initDatabase() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_POINTS);
      if (stored) {
        state.points = JSON.parse(stored);
        // Atualiza coordenadas e nomes para casar com a nova imagem de satélite
        state.points.forEach(pt => {
          const initMatch = INITIAL_POINTS.find(i => i.id === pt.id || i.code === pt.code);
          if (initMatch) {
            pt.xPercent = initMatch.xPercent;
            pt.yPercent = initMatch.yPercent;
            pt.name = initMatch.name;
          }
        });
      } else {
        state.points = INITIAL_POINTS;
        savePointsDatabase();
      }
    } catch (e) {
      console.warn('[SAMA Public] Falha ao ler localStorage. Usando banco em memória.', e);
      state.points = INITIAL_POINTS;
    }

    // Calcula os status semafóricos para todos os pontos
    state.points.forEach(pt => {
      pt.statusObj = evaluateWorstCaseStatus(pt.current);
    });
  }

  function savePointsDatabase() {
    try {
      localStorage.setItem(STORAGE_KEY_POINTS, JSON.stringify(state.points));
    } catch (e) {
      console.warn('[SAMA Public] Erro ao salvar dados no localStorage.', e);
    }
  }

  // 7. Renderização dos Pinos no Mapa
  function renderMapPins() {
    if (!DOM.pinsLayer) return;
    DOM.pinsLayer.innerHTML = '';

    state.points.forEach(point => {
      // Filtragem semafórica
      if (state.activeFilter !== 'all' && point.statusObj.level !== state.activeFilter) {
        return;
      }

      const pin = document.createElement('button');
      pin.className = `map-pin pin--${point.statusObj.level}`;
      pin.setAttribute('data-point-id', point.id);
      pin.setAttribute('aria-label', `Ponto ${point.code}: ${point.name}. Status: ${point.statusObj.badge}`);
      pin.style.left = `${point.xPercent}%`;
      pin.style.top = `${point.yPercent}%`;

      if (state.selectedPoint && state.selectedPoint.id === point.id) {
        pin.classList.add('active');
      }

      pin.innerHTML = `
        <span class="pin-pulse" aria-hidden="true"></span>
        <span class="pin-core">${point.code}</span>
      `;

      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        selectPoint(point.id);
      });

      DOM.pinsLayer.appendChild(pin);
    });
  }

  // 8. Renderização do Painel Lateral e KPIs
  function renderDrawerInfo() {
    if (!DOM.drawerPointsList) return;

    let countTotal = state.points.length;
    let countGreen = 0;
    let countYellow = 0;
    let countRed = 0;

    DOM.drawerPointsList.innerHTML = '';

    state.points.forEach(pt => {
      if (pt.statusObj.level === 'green') countGreen++;
      if (pt.statusObj.level === 'yellow') countYellow++;
      if (pt.statusObj.level === 'red') countRed++;

      const li = document.createElement('li');
      li.innerHTML = `
        <button class="point-item-btn" data-point-id="${pt.id}">
          <div class="point-item-left">
            <span class="point-item-code">${pt.code}</span>
            <span class="point-item-name">${pt.name}</span>
          </div>
          <span class="point-item-status-tag tag--${pt.statusObj.level}">
            ${pt.statusObj.badge}
          </span>
        </button>
      `;

      li.querySelector('button').addEventListener('click', () => {
        selectPoint(pt.id);
        closeDrawer();
      });

      DOM.drawerPointsList.appendChild(li);
    });

    // Atualiza contadores de KPIs
    if (DOM.kpiTotalPoints) DOM.kpiTotalPoints.textContent = countTotal;
    if (DOM.kpiIdealPoints) DOM.kpiIdealPoints.textContent = countGreen;
    if (DOM.kpiWarningPoints) DOM.kpiWarningPoints.textContent = countYellow;
    if (DOM.kpiCriticalPoints) DOM.kpiCriticalPoints.textContent = countRed;

    // Atualiza pílula de status global no topo
    if (DOM.globalStatusPill) {
      const dot = DOM.globalStatusPill.querySelector('.status-dot');
      const text = DOM.globalStatusPill.querySelector('.status-text');
      if (countRed > 0) {
        dot.className = 'status-dot status-dot--red';
        text.innerHTML = 'Status: <strong>Alerta de Desconformidade</strong>';
      } else if (countYellow > 0) {
        dot.className = 'status-dot status-dot--yellow';
        text.innerHTML = 'Status: <strong>Atenção Geral</strong>';
      } else {
        dot.className = 'status-dot status-dot--green';
        text.innerHTML = 'Status: <strong>Bacia Segura</strong>';
      }
    }
  }

  // 9. Seleção de Ponto e Abertura do Card Flutuante
  function selectPoint(pointId) {
    const point = state.points.find(p => p.id === pointId);
    if (!point) return;

    state.selectedPoint = point;

    // Atualiza classe ativa dos pinos
    document.querySelectorAll('.map-pin').forEach(pin => {
      pin.classList.toggle('active', pin.getAttribute('data-point-id') === pointId);
    });

    // Preenche os dados no Card Flutuante
    DOM.cardPointCode.textContent = point.code;
    DOM.cardPointName.textContent = point.name;
    DOM.cardPointCoords.textContent = point.coordsDesc;
    DOM.cardLastCollectionDate.textContent = point.lastUpdate;
    DOM.cardOperator.textContent = point.operator;

    // Estilização semafórica estrita do card
    const st = point.statusObj;
    DOM.cardVerdictBox.className = `status-verdict-box verdict-box--${st.level}`;
    DOM.cardVerdictBadge.textContent = st.badge;
    DOM.cardVerdictCondition.textContent = st.condition;
    DOM.cardVerdictRationale.textContent = st.rationale;

    // Ícone SVG Semafórico
    let iconSvg = '';
    if (st.level === 'green') {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (st.level === 'yellow') {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    }
    DOM.cardVerdictIcon.innerHTML = iconSvg;

    // Preenche Métricas
    const curr = point.current;
    DOM.valPh.textContent = curr.ph.toFixed(2);
    // Barra de pH (0 a 14)
    const phPercent = Math.min(100, Math.max(0, (curr.ph / 14) * 100));
    DOM.barPh.style.width = `${phPercent}%`;

    DOM.valTurbidity.textContent = curr.turbidity.toFixed(1);
    if (curr.turbidity > THRESHOLDS.turbidity.criticalMax) {
      DOM.threshTurbidity.innerHTML = '<span style="color:var(--status-red);font-weight:700;">&#9888; Não Conforme (>40 NTU)</span>';
    } else {
      DOM.threshTurbidity.textContent = 'Máx. CONAMA: 40 NTU';
    }

    DOM.valEColi.textContent = curr.eColi.toLocaleString('pt-BR');
    if (curr.eColi > THRESHOLDS.eColi.criticalMax) {
      DOM.threshEColi.innerHTML = '<span style="color:var(--status-red);font-weight:700;">&#9888; Contaminação Severa</span>';
    } else {
      DOM.threshEColi.textContent = 'Limite: 1.000 NMP/100mL';
    }

    DOM.valOd.textContent = curr.dissolvedOxygen.toFixed(1);
    if (curr.dissolvedOxygen < THRESHOLDS.dissolvedOxygen.criticalMin) {
      DOM.threshOd.innerHTML = '<span style="color:var(--status-red);font-weight:700;">&#9888; Anóxia / Baixo (<4.0)</span>';
    } else {
      DOM.threshOd.textContent = 'Mínimo: 5.0 mg/L';
    }

    DOM.valTemp.textContent = curr.waterTemp.toFixed(1);
    DOM.valPhosphorus.textContent = curr.totalPhosphorus.toFixed(3);

    // Exibe o card flutuante
    DOM.floatingCard.hidden = false;

    // Renderiza o mini-gráfico de 30 dias em Canvas
    renderCanvasChart();
  }

  function closeCard() {
    if (DOM.floatingCard) {
      DOM.floatingCard.hidden = true;
    }
    state.selectedPoint = null;
    document.querySelectorAll('.map-pin').forEach(pin => pin.classList.remove('active'));
  }

  // 10. RENDERIZADOR NATIVO EM CANVAS DO MINI-GRÁFICO DE 30 DIAS
  // Ultra-leve, zero dependências de rede, performance de < 2ms e alta definição.
  let chartPointsCoords = []; // Armazena posições para hover do tooltip

  function renderCanvasChart() {
    if (!state.selectedPoint || !DOM.miniTrendCanvas) return;

    const canvas = DOM.miniTrendCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Calibração Retina Display
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const history = state.selectedPoint.history30d;
    if (!history || history.length === 0) return;

    const metric = state.activeChartMetric;
    const dataVals = history.map(h => h[metric]);

    // Metadados do parâmetro selecionado
    let metricTitle = '';
    let unit = '';
    let limitVal = null;
    let limitLabel = '';
    let lineColor = '#0d9488';
    let gradientStart = 'rgba(13, 148, 136, 0.25)';

    switch (metric) {
      case 'turbidity':
        metricTitle = 'Turbidez';
        unit = 'NTU';
        limitVal = THRESHOLDS.turbidity.criticalMax; // 40
        limitLabel = 'Limite CONAMA (40 NTU)';
        lineColor = '#f59e0b';
        gradientStart = 'rgba(245, 158, 11, 0.25)';
        break;
      case 'eColi':
        metricTitle = 'E. coli';
        unit = 'NMP/100mL';
        limitVal = THRESHOLDS.eColi.criticalMax; // 1000
        limitLabel = 'Limite Balneabilidade (1000 NMP)';
        lineColor = '#ef4444';
        gradientStart = 'rgba(239, 68, 68, 0.25)';
        break;
      case 'ph':
        metricTitle = 'pH';
        unit = '';
        limitVal = 9.0;
        limitLabel = 'Faixa Ideal (6.0 - 9.0)';
        lineColor = '#0d9488';
        gradientStart = 'rgba(13, 148, 136, 0.25)';
        break;
      case 'od':
        metricTitle = 'Oxigênio Dissolvido';
        unit = 'mg/L';
        limitVal = THRESHOLDS.dissolvedOxygen.criticalMin; // 4.0
        limitLabel = 'Mínimo Aceitável (4.0 mg/L)';
        lineColor = '#3b82f6';
        gradientStart = 'rgba(59, 130, 246, 0.25)';
        break;
    }

    if (DOM.chartMetricLabel) {
      DOM.chartMetricLabel.textContent = `Parâmetro: ${metricTitle} (${unit || 'Escala'})`;
    }

    // Cálculos Estatísticos (Mín, Média, Máx)
    const minVal = Math.min(...dataVals);
    const maxVal = Math.max(...dataVals);
    const avgVal = dataVals.reduce((a, b) => a + b, 0) / dataVals.length;

    if (DOM.chartStatMin) DOM.chartStatMin.textContent = `${minVal.toFixed(1)} ${unit}`;
    if (DOM.chartStatAvg) DOM.chartStatAvg.textContent = `${avgVal.toFixed(1)} ${unit}`;
    if (DOM.chartStatMax) DOM.chartStatMax.textContent = `${maxVal.toFixed(1)} ${unit}`;
    if (DOM.chartStatLimit) DOM.chartStatLimit.textContent = limitLabel;

    // Área Útil do Gráfico
    const padTop = 20;
    const padBottom = 26;
    const padLeft = 42;
    const padRight = 16;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Escala Y com folga visual
    let yMin = Math.min(minVal, limitVal !== null ? limitVal : minVal);
    let yMax = Math.max(maxVal, limitVal !== null ? limitVal : maxVal);
    const span = yMax - yMin || 1;
    yMin = Math.max(0, yMin - span * 0.15);
    yMax = yMax + span * 0.15;

    function getY(val) {
      return padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;
    }

    function getX(index) {
      return padLeft + (index / (dataVals.length - 1)) * plotW;
    }

    // Linhas de Grade Horizontais
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    const gridSteps = 3;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= gridSteps; i++) {
      const gVal = yMin + (span / gridSteps) * i;
      const gy = getY(gVal);
      ctx.beginPath();
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(width - padRight, gy);
      ctx.stroke();
      ctx.fillText(gVal.toFixed(1), padLeft - 6, gy);
    }

    // Linha de Limite Regulatório CONAMA (se aplicável)
    if (limitVal !== null && limitVal >= yMin && limitVal <= yMax) {
      const limitY = getY(limitVal);
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, limitY);
      ctx.lineTo(width - padRight, limitY);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Ref: ${limitVal}`, width - padRight, limitY - 6);
      ctx.restore();
    }

    // Área Preenchida com Gradiente
    ctx.setLineDash([]);
    const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    gradient.addColorStop(0, gradientStart);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(dataVals[0]));
    for (let i = 1; i < dataVals.length; i++) {
      ctx.lineTo(getX(i), getY(dataVals[i]));
    }
    ctx.lineTo(getX(dataVals.length - 1), padTop + plotH);
    ctx.lineTo(getX(0), padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Linha Principal de Tendência
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(dataVals[0]));
    chartPointsCoords = [];

    for (let i = 0; i < dataVals.length; i++) {
      const cx = getX(i);
      const cy = getY(dataVals[i]);
      chartPointsCoords.push({
        x: cx,
        y: cy,
        val: dataVals[i],
        date: history[i].date,
        dayOffset: history[i].dayOffset
      });

      if (i > 0) ctx.lineTo(cx, cy);
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Marcadores dos Pontos (Apenas nos dias extremos e amostrais)
    chartPointsCoords.forEach((pt, idx) => {
      if (idx === 0 || idx === chartPointsCoords.length - 1 || idx % 7 === 0) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Rótulos do Eixo X (Datas)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const firstPt = chartPointsCoords[0];
    const midPt = chartPointsCoords[Math.floor(chartPointsCoords.length / 2)];
    const lastPt = chartPointsCoords[chartPointsCoords.length - 1];

    if (firstPt) ctx.fillText(`-30d (${firstPt.date})`, firstPt.x + 12, padTop + plotH + 8);
    if (midPt) ctx.fillText(`-15d (${midPt.date})`, midPt.x, padTop + plotH + 8);
    if (lastPt) ctx.fillText(`Hoje (${lastPt.date})`, lastPt.x - 12, padTop + plotH + 8);
  }

  // Interatividade com Hover no Canvas (Tooltip dos 30 dias)
  function setupCanvasTooltip() {
    const canvas = DOM.miniTrendCanvas;
    const tooltip = DOM.chartTooltip;
    if (!canvas || !tooltip) return;

    function handlePointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (!chartPointsCoords || chartPointsCoords.length === 0) return;

      // Encontra o ponto mais próximo horizontalmente
      let closest = chartPointsCoords[0];
      let minDiff = Math.abs(mouseX - closest.x);

      for (let i = 1; i < chartPointsCoords.length; i++) {
        const diff = Math.abs(mouseX - chartPointsCoords[i].x);
        if (diff < minDiff) {
          minDiff = diff;
          closest = chartPointsCoords[i];
        }
      }

      if (minDiff < 30) {
        const metric = state.activeChartMetric;
        let unit = metric === 'turbidity' ? 'NTU' : metric === 'eColi' ? 'NMP' : metric === 'od' ? 'mg/L' : '';
        tooltip.innerHTML = `<strong>${closest.date}</strong>: ${closest.val} ${unit}`;
        tooltip.style.left = `${closest.x}px`;
        tooltip.style.top = `${closest.y}px`;
        tooltip.hidden = false;
      } else {
        tooltip.hidden = true;
      }
    }

    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        handlePointerMove(e.touches[0]);
      }
    }, { passive: true });

    canvas.addEventListener('touchend', () => {
      tooltip.hidden = true;
    });
  }

  // 11. Controles do Menu Lateral (Drawer Overlay Suave)
  function openDrawer() {
    DOM.sideDrawer.classList.add('active');
    DOM.drawerBackdrop.classList.add('active');
    DOM.sideDrawer.setAttribute('aria-hidden', 'false');
    DOM.btnToggleDrawer.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    DOM.sideDrawer.classList.remove('active');
    DOM.drawerBackdrop.classList.remove('active');
    DOM.sideDrawer.setAttribute('aria-hidden', 'true');
    DOM.btnToggleDrawer.setAttribute('aria-expanded', 'false');
  }

  // 12. Controles de Zoom do Mapa
  function applyZoom(newZoom) {
    state.zoomLevel = Math.min(2.5, Math.max(1.0, newZoom));
    if (DOM.mapCanvasWrapper) {
      DOM.mapCanvasWrapper.style.transform = `scale(${state.zoomLevel})`;
    }
  }

  // 13. Event Listeners e Inicialização Geral
  function setupEventListeners() {
    // Menu Drawer
    DOM.btnToggleDrawer.addEventListener('click', openDrawer);
    DOM.btnCloseDrawer.addEventListener('click', closeDrawer);
    DOM.drawerBackdrop.addEventListener('click', closeDrawer);

    // Fechar Card Flutuante
    DOM.btnCloseCard.addEventListener('click', closeCard);

    // Filtros Semafóricos no Drawer
    DOM.filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFilter = btn.getAttribute('data-filter') || 'all';
        renderMapPins();
      });
    });

    // Abas de Parâmetros do Mini-Gráfico
    DOM.chartTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        DOM.chartTabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        state.activeChartMetric = tab.getAttribute('data-chart-metric') || 'turbidity';
        renderCanvasChart();
      });
    });

    // Controles de Zoom
    DOM.btnZoomIn.addEventListener('click', () => applyZoom(state.zoomLevel + 0.25));
    DOM.btnZoomOut.addEventListener('click', () => applyZoom(state.zoomLevel - 0.25));
    DOM.btnZoomReset.addEventListener('click', () => applyZoom(1.0));

    // Fechar ao teclar Esc
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCard();
        closeDrawer();
      }
    });

    // Responsividade no redimensionamento da janela (re-renderiza Canvas com DPI correto)
    window.addEventListener('resize', () => {
      if (state.selectedPoint) {
        renderCanvasChart();
      }
    });

    // Tooltip interativo do gráfico
    setupCanvasTooltip();

    // Sincronização passiva: se o operador salvou algo no especialista em outra aba
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY_POINTS) {
        initDatabase();
        renderMapPins();
        renderDrawerInfo();
        if (state.selectedPoint) {
          selectPoint(state.selectedPoint.id);
        }
      }
    });
  }

  // 14. Inicialização do Módulo Público
  function bootstrap() {
    initDatabase();
    renderMapPins();
    renderDrawerInfo();
    setupEventListeners();

    // Abre o Ponto 1 (Crítico) por padrão para demonstrar imediatamente a regra de pior cenário exigida
    setTimeout(() => {
      selectPoint('P1');
    }, 400);
  }

  // Executa no DOMContentLoaded garantindo renderização ultra rápida (< 2s)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
