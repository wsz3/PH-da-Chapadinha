/**
 * ============================================================================
 * SAMA - Sistema Autônomo de Monitoramento Ambiental (Lagoa da Chapadinha)
 * VISÃO DO ESPECIALISTA (Operador de Campo) - especialista.js
 *
 * Módulo isolado (IIFE) sem vazamento de escopo global.
 * Implementa a Arquitetura Offline-First com LocalStorage, preenchimento automático
 * por clique na carta cartográfica, validação estrita de pH (0-14), captura
 * fotográfica comprimida e sincronização resiliente com a base central.
 * ============================================================================
 */
(function () {
  'use strict';

  // 1. Constantes e Chaves de Persistência
  const STORAGE_KEY_OFFLINE = 'SAMA_OFFLINE_COLETAS';
  const STORAGE_KEY_POINTS = 'SAMA_MONITORAMENTO_DB';

  // Delimitação Cartográfica da Lagoa da Chapadinha para Cálculo de Coordenadas
  // X: 0% -> Long -44.30500 | 100% -> Long -44.28500
  // Y: 0% -> Lat -10.07000  | 100% -> Lat -10.09000
  const GEO_BOUNDS = {
    latMin: -10.09000,
    latMax: -10.07000,
    lngMin: -44.30500,
    lngMax: -44.28500
  };

  // Coordenadas padrão dos pontos cadastrados
  const PRESET_POINTS = {
    P1: { name: 'P1 - Foz Norte / Cabeceira da Lagoa', xPercent: 33.0, yPercent: 12.0, lat: -10.07240, lng: -44.29840 },
    P2: { name: 'P2 - Orla Leste / Parque Regina Freire', xPercent: 64.0, yPercent: 35.0, lat: -10.07700, lng: -44.29220 },
    P3: { name: 'P3 - Lâmina Central / Águas Abertas', xPercent: 44.0, yPercent: 46.0, lat: -10.07920, lng: -44.29620 },
    P4: { name: 'P4 - Margem Oeste / Orla Urbana', xPercent: 30.0, yPercent: 58.0, lat: -10.08160, lng: -44.29900 },
    P5: { name: 'P5 - Vertedouro Sul / Zona de Macrófitas', xPercent: 58.0, yPercent: 82.0, lat: -10.08640, lng: -44.29340 }
  };

  // 2. Estado Interno do Terminal do Especialista
  const state = {
    isOnline: navigator.onLine,
    selectedPointKey: 'P1',
    currentCoords: { lat: -10.07240, lng: -44.29840, xPercent: 33.0, yPercent: 12.0 },
    currentPhotoBase64: null,
    currentPhotoName: null,
    offlineQueue: [],
    isSyncing: false
  };

  // 3. Referências DOM
  const DOM = {
    // Header & Rede
    networkBadge: document.getElementById('networkBadge'),
    networkDot: document.getElementById('networkDot'),
    networkLabel: document.getElementById('networkLabel'),
    syncBanner: document.getElementById('syncBanner'),
    syncStatusText: document.getElementById('syncStatusText'),
    pendingCounterBadge: document.getElementById('pendingCounterBadge'),
    btnManualSync: document.getElementById('btnManualSync'),

    // Mapa de Amostragem
    fieldMapContainer: document.getElementById('fieldMapContainer'),
    fieldMapImg: document.getElementById('fieldMapImg'),
    collectionPin: document.getElementById('collectionPin'),
    mapOverlayCoords: document.getElementById('mapOverlayCoords'),
    btnUseGps: document.getElementById('btnUseGps'),

    // Formulário
    form: document.getElementById('fieldCollectionForm'),
    pointSelect: document.getElementById('pointSelect'),
    inputLat: document.getElementById('inputLat'),
    inputLng: document.getElementById('inputLng'),
    inputTimestamp: document.getElementById('inputTimestamp'),
    inputOperator: document.getElementById('inputOperator'),

    // Físicos
    inputAirTemp: document.getElementById('inputAirTemp'),
    inputWaterTemp: document.getElementById('inputWaterTemp'),
    inputColor: document.getElementById('inputColor'),
    inputTurbidity: document.getElementById('inputTurbidity'),

    // Químicos (pH estrito)
    phFormField: document.getElementById('phFormField'),
    inputPh: document.getElementById('inputPh'),
    phValidationMsg: document.getElementById('phValidationMsg'),
    inputOd: document.getElementById('inputOd'),
    inputPhosphorus: document.getElementById('inputPhosphorus'),

    // Biológicos
    inputEColi: document.getElementById('inputEColi'),
    inputTotalColiforms: document.getElementById('inputTotalColiforms'),

    // Observações & Foto
    chkOdor: document.getElementById('chkOdor'),
    chkWaste: document.getElementById('chkWaste'),
    chkAlgae: document.getElementById('chkAlgae'),
    chkFoam: document.getElementById('chkFoam'),
    samplePhotoInput: document.getElementById('samplePhotoInput'),
    btnTriggerPhoto: document.getElementById('btnTriggerPhoto'),
    photoPreviewContainer: document.getElementById('photoPreviewContainer'),
    photoPreviewImg: document.getElementById('photoPreviewImg'),
    photoFileName: document.getElementById('photoFileName'),
    photoFileSize: document.getElementById('photoFileSize'),
    btnRemovePhoto: document.getElementById('btnRemovePhoto'),
    inputNotes: document.getElementById('inputNotes'),

    // Botões de Ação
    btnSubmitSample: document.getElementById('btnSubmitSample'),
    btnResetForm: document.getElementById('btnResetForm'),

    // Fila Offline
    queueList: document.getElementById('queueList'),
    queueEmptyState: document.getElementById('queueEmptyState'),
    btnClearQueue: document.getElementById('btnClearQueue'),

    // Feedback Toast
    toastAlert: document.getElementById('toastAlert')
  };

  // 4. Captura Automática de Data/Hora (Padrão ISO & Legível)
  function refreshTimestamp() {
    const now = new Date();
    // Exibição em formato brasileiro amigável no input: DD/MM/AAAA HH:MM:SS
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());

    if (DOM.inputTimestamp) {
      DOM.inputTimestamp.value = `${day}/${month}/${year} às ${hours}:${minutes}:${seconds}`;
      DOM.inputTimestamp.dataset.isoDate = now.toISOString();
    }
  }

  // 5. MAPA DE COLETA: Clique na Carta Cartográfica Preenche Coordenadas Automaticamente
  /**
   * Converte a posição clicada no container (X%, Y%) em coordenadas geográficas
   * calibradas da bacia da Lagoa da Chapadinha e atualiza os campos do formulário.
   */
  function handleMapClick(e) {
    const rect = DOM.fieldMapContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Percentual relativo dentro da imagem (0 a 100)
    const xPct = Math.min(100, Math.max(0, (clickX / rect.width) * 100));
    const yPct = Math.min(100, Math.max(0, (clickY / rect.height) * 100));

    // Interpolação para Latitude e Longitude
    const lat = GEO_BOUNDS.latMax - (yPct / 100) * (GEO_BOUNDS.latMax - GEO_BOUNDS.latMin);
    const lng = GEO_BOUNDS.lngMin + (xPct / 100) * (GEO_BOUNDS.lngMax - GEO_BOUNDS.lngMin);

    updateMapCoordinates(lat, lng, xPct, yPct);

    // Seleciona opção "NOVO" ou customizada no select caso não seja um ponto fixo
    if (DOM.pointSelect && DOM.pointSelect.value !== 'NOVO') {
      DOM.pointSelect.value = 'NOVO';
    }

    showToast('Coordenadas capturadas do mapa!', 'success', 2000);
  }

  function updateMapCoordinates(lat, lng, xPct, yPct) {
    state.currentCoords = {
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      xPercent: Number(xPct.toFixed(1)),
      yPercent: Number(yPct.toFixed(1))
    };

    // Atualiza os inputs do formulário
    if (DOM.inputLat) DOM.inputLat.value = state.currentCoords.lat.toFixed(5);
    if (DOM.inputLng) DOM.inputLng.value = state.currentCoords.lng.toFixed(5);

    // Move o pino de coleta no mapa
    if (DOM.collectionPin) {
      DOM.collectionPin.style.left = `${state.currentCoords.xPercent}%`;
      DOM.collectionPin.style.top = `${state.currentCoords.yPercent}%`;
    }

    // Atualiza o overlay com as coordenadas no canto da imagem
    if (DOM.mapOverlayCoords) {
      DOM.mapOverlayCoords.textContent = `Lat: ${state.currentCoords.lat.toFixed(5)} | Long: ${state.currentCoords.lng.toFixed(5)}`;
    }
  }

  // Captura via GPS Nativo do Smartphone
  function handleUseGps() {
    if (!navigator.geolocation) {
      showToast('Geolocalização não suportada neste dispositivo.', 'warning');
      return;
    }

    showToast('Obtendo posição via satélite/GPS...', 'warning', 2500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Projeta no mapa cartográfico
        const xPct = ((lng - GEO_BOUNDS.lngMin) / (GEO_BOUNDS.lngMax - GEO_BOUNDS.lngMin)) * 100;
        const yPct = ((GEO_BOUNDS.latMax - lat) / (GEO_BOUNDS.latMax - GEO_BOUNDS.latMin)) * 100;

        const clampedX = Math.min(95, Math.max(5, xPct));
        const clampedY = Math.min(95, Math.max(5, yPct));

        updateMapCoordinates(lat, lng, clampedX, clampedY);
        showToast(`GPS fixado: precisão de ~${Math.round(pos.coords.accuracy)}m`, 'success');
      },
      (err) => {
        console.warn('[SAMA Campo] Erro GPS:', err.message);
        showToast('Não foi possível obter o sinal de GPS. Toque diretamente no mapa.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // 6. VALIDAÇÃO ESTRITA DE pH (ACEITANDO APENAS VALORES DE 0 A 14)
  /**
   * Realiza a validação rigorosa do input de pH.
   * Não permite envio caso esteja em branco, não-numérico ou fora de [0.00, 14.00].
   */
  function validatePhStrict() {
    const rawVal = DOM.inputPh.value.trim();
    if (!rawVal) {
      setPhError('O valor do pH é obrigatório.');
      return false;
    }

    const num = parseFloat(rawVal.replace(',', '.'));

    if (isNaN(num)) {
      setPhError('Insira um valor numérico válido para o pH.');
      return false;
    }

    if (num < 0 || num > 14) {
      setPhError(`O pH (${num.toFixed(2)}) é INVÁLIDO. A escala de pH aceita estritamente valores de 0.00 a 14.00.`);
      return false;
    }

    // Válido
    clearPhError();
    return true;
  }

  function setPhError(msg) {
    DOM.phFormField.classList.add('has-error');
    DOM.phValidationMsg.textContent = msg;
    DOM.inputPh.setAttribute('aria-invalid', 'true');
  }

  function clearPhError() {
    DOM.phFormField.classList.remove('has-error');
    DOM.phValidationMsg.textContent = '';
    DOM.inputPh.removeAttribute('aria-invalid');
  }

  // 7. UPLOAD DE FOTO DA AMOSTRA COM COMPRESSÃO EM CANVAS
  /**
   * Lê a foto da câmera ou arquivo, redimensiona e comprime via Canvas para
   * garantir leveza total (< 50KB) no LocalStorage.
   */
  function handlePhotoUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = new Image();
      img.onload = function () {
        // Redimensiona proporcionalmente para no máximo 600px
        const maxDim = 600;
        let w = img.width;
        let h = img.height;

        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Exporta como JPEG com compressão 0.7
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        state.currentPhotoBase64 = compressedBase64;
        state.currentPhotoName = file.name;

        // Atualiza preview na tela
        DOM.photoPreviewImg.src = compressedBase64;
        DOM.photoFileName.textContent = file.name;
        const approxKb = Math.round((compressedBase64.length * 3) / 4 / 1024);
        DOM.photoFileSize.textContent = `Comprimida: ~${approxKb} KB (Pronta para LocalStorage)`;
        DOM.photoPreviewContainer.hidden = false;

        showToast('Foto da amostra anexada e comprimida com sucesso!', 'success');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    state.currentPhotoBase64 = null;
    state.currentPhotoName = null;
    DOM.samplePhotoInput.value = '';
    DOM.photoPreviewContainer.hidden = true;
    DOM.photoPreviewImg.src = '';
  }

  // 8. ARQUITETURA OFFLINE-FIRST & PERSISTÊNCIA EM LOCALSTORAGE
  function loadOfflineQueue() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_OFFLINE);
      state.offlineQueue = stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('[SAMA Campo] Erro ao carregar fila offline:', e);
      state.offlineQueue = [];
    }
    renderOfflineQueue();
    updateNetworkAndSyncUI();
  }

  function saveOfflineQueue() {
    try {
      localStorage.setItem(STORAGE_KEY_OFFLINE, JSON.stringify(state.offlineQueue));
    } catch (e) {
      console.error('[SAMA Campo] Falha ao gravar no LocalStorage:', e);
      showToast('Aviso: Armazenamento local cheio ou indisponível.', 'error');
    }
    renderOfflineQueue();
    updateNetworkAndSyncUI();
  }

  function renderOfflineQueue() {
    if (!DOM.queueList) return;

    // Filtra coletas
    const pendingList = state.offlineQueue.filter(item => item.syncStatus === 'pending');
    DOM.pendingCounterBadge.textContent = `${pendingList.length} pendente(s)`;

    if (pendingList.length > 0) {
      DOM.pendingCounterBadge.classList.add('has-pending');
      DOM.syncStatusText.textContent = `${pendingList.length} coleta(s) salvas no dispositivo aguardando envio`;
    } else {
      DOM.pendingCounterBadge.classList.remove('has-pending');
      DOM.syncStatusText.textContent = state.isOnline ? 'Todos os dados estão sincronizados!' : 'Modo Offline ativo (Beira da Lagoa)';
    }

    if (state.offlineQueue.length === 0) {
      DOM.queueList.innerHTML = '';
      if (DOM.queueEmptyState) DOM.queueList.appendChild(DOM.queueEmptyState);
      return;
    }

    DOM.queueList.innerHTML = '';
    state.offlineQueue.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'queue-item';

      const isSynced = item.syncStatus === 'synced';
      const statusBadge = isSynced
        ? `<span class="queue-item-status queue-item-status--synced">&#10003; Sincronizado</span>`
        : `<span class="queue-item-status queue-item-status--pending">&#9203; Na Fila Local</span>`;

      el.innerHTML = `
        <div class="queue-item-left">
          <span class="queue-item-point">${item.pointName}</span>
          <span class="queue-item-meta">
            ${item.displayDate} | pH: <strong>${item.data.ph.toFixed(2)}</strong> | Turb: <strong>${item.data.turbidity} NTU</strong> | E. coli: <strong>${item.data.eColi}</strong>
          </span>
        </div>
        ${statusBadge}
      `;

      DOM.queueList.appendChild(el);
    });
  }

  // 9. ENVIO DO FORMULÁRIO DE COLETA
  function handleFormSubmit(e) {
    e.preventDefault();

    // 1. Validação estrita de pH
    if (!validatePhStrict()) {
      DOM.inputPh.focus();
      showToast('Corrija o pH antes de salvar (aceito apenas 0 a 14).', 'error');
      return;
    }

    // 2. Extração dos Parâmetros
    const phVal = parseFloat(DOM.inputPh.value.replace(',', '.'));
    const airTempVal = parseFloat(DOM.inputAirTemp.value) || 28.0;
    const waterTempVal = parseFloat(DOM.inputWaterTemp.value) || 25.0;
    const colorVal = parseInt(DOM.inputColor.value, 10) || 10;
    const turbidityVal = parseFloat(DOM.inputTurbidity.value) || 15.0;
    const odVal = parseFloat(DOM.inputOd.value) || 6.0;
    const phosphorusVal = parseFloat(DOM.inputPhosphorus.value) || 0.025;
    const eColiVal = parseInt(DOM.inputEColi.value, 10) || 100;
    const totalColiformsVal = parseInt(DOM.inputTotalColiforms.value, 10) || 500;

    // Checkboxes de evidências
    const evidences = [];
    if (DOM.chkOdor.checked) evidences.push('Mau cheiro característico');
    if (DOM.chkWaste.checked) evidences.push('Resíduos sólidos / lixo');
    if (DOM.chkAlgae.checked) evidences.push('Floração de algas');
    if (DOM.chkFoam.checked) evidences.push('Espuma / óleo');

    const pointKey = DOM.pointSelect.value;
    const pointName = pointKey === 'NOVO'
      ? `Estação Avulsa (${state.currentCoords.lat.toFixed(4)}, ${state.currentCoords.lng.toFixed(4)})`
      : (PRESET_POINTS[pointKey] ? PRESET_POINTS[pointKey].name : pointKey);

    const now = new Date();
    const sampleRecord = {
      id: 'COL_' + Date.now(),
      pointKey: pointKey,
      pointName: pointName,
      displayDate: DOM.inputTimestamp.value,
      isoDate: now.toISOString(),
      operator: DOM.inputOperator.value.trim() || 'Operador de Campo SAMA',
      coords: { ...state.currentCoords },
      data: {
        ph: phVal,
        airTemp: airTempVal,
        waterTemp: waterTempVal,
        color: colorVal,
        turbidity: turbidityVal,
        dissolvedOxygen: odVal,
        totalPhosphorus: phosphorusVal,
        eColi: eColiVal,
        totalColiforms: totalColiformsVal
      },
      evidences: evidences,
      notes: DOM.inputNotes.value.trim(),
      photoBase64: state.currentPhotoBase64,
      photoName: state.currentPhotoName,
      syncStatus: state.isOnline ? 'synced' : 'pending'
    };

    // Salva na fila do LocalStorage
    state.offlineQueue.unshift(sampleRecord);
    saveOfflineQueue();

    // Se estiver online, sincroniza imediatamente com a base central
    if (state.isOnline) {
      applySampleToDatabase(sampleRecord);
      showToast(`Coleta de ${pointName} gravada e sincronizada online!`, 'success', 3500);
    } else {
      showToast(`Coleta salva LOCALMENTE (Modo Offline). Será sincronizada com o servidor ao reconectar!`, 'warning', 4500);
    }

    // Atualiza timestamp para o próximo registro
    refreshTimestamp();
  }

  // 10. SINCRONIZAÇÃO RESILIENTE COM A BASE DE DADOS CENTRAL (SAMA_MONITORAMENTO_DB)
  /**
   * Consolida a coleta registrada com o banco central lido pela Visão Pública.
   * Desta forma, a Visão Pública reflete em tempo real os dados colhidos em campo!
   */
  function applySampleToDatabase(sample) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_POINTS);
      let points = stored ? JSON.parse(stored) : [];

      let targetPoint = points.find(p => p.id === sample.pointKey || p.code === sample.pointKey);

      if (targetPoint) {
        // Atualiza ponto existente
        targetPoint.current.ph = sample.data.ph;
        targetPoint.current.turbidity = sample.data.turbidity;
        targetPoint.current.eColi = sample.data.eColi;
        targetPoint.current.dissolvedOxygen = sample.data.dissolvedOxygen;
        targetPoint.current.waterTemp = sample.data.waterTemp;
        targetPoint.current.airTemp = sample.data.airTemp;
        targetPoint.current.totalPhosphorus = sample.data.totalPhosphorus;
        targetPoint.lastUpdate = 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        targetPoint.operator = sample.operator;

        // Adiciona ao histórico de 30 dias (último ponto)
        if (targetPoint.history30d && targetPoint.history30d.length > 0) {
          const lastH = targetPoint.history30d[targetPoint.history30d.length - 1];
          lastH.ph = sample.data.ph;
          lastH.turbidity = sample.data.turbidity;
          lastH.eColi = sample.data.eColi;
          lastH.od = sample.data.dissolvedOxygen;
        }
      } else {
        // Se for um novo ponto amostral avulso criado pelo especialista
        const newPoint = {
          id: sample.pointKey === 'NOVO' ? 'P' + (points.length + 1) : sample.pointKey,
          code: sample.pointKey === 'NOVO' ? 'P' + (points.length + 1) : sample.pointKey,
          name: sample.pointName,
          coordsDesc: `${sample.coords.lat.toFixed(4)}° S, ${Math.abs(sample.coords.lng).toFixed(4)}° W`,
          xPercent: sample.coords.xPercent,
          yPercent: sample.coords.yPercent,
          lastUpdate: 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          operator: sample.operator,
          current: { ...sample.data },
          history30d: []
        };
        points.push(newPoint);
      }

      localStorage.setItem(STORAGE_KEY_POINTS, JSON.stringify(points));
    } catch (e) {
      console.warn('[SAMA Campo] Erro ao sincronizar ponto no banco central:', e);
    }
  }

  /**
   * Sincroniza todas as coletas pendentes da fila offline
   */
  function syncAllPending() {
    if (state.isSyncing) return;
    state.isSyncing = true;

    DOM.btnManualSync.classList.add('syncing');
    DOM.syncStatusText.textContent = 'Sincronizando coletas pendentes com o servidor...';

    setTimeout(() => {
      let syncedCount = 0;
      state.offlineQueue.forEach(item => {
        if (item.syncStatus === 'pending') {
          applySampleToDatabase(item);
          item.syncStatus = 'synced';
          syncedCount++;
        }
      });

      saveOfflineQueue();
      state.isSyncing = false;
      DOM.btnManualSync.classList.remove('syncing');

      if (syncedCount > 0) {
        showToast(`Sincronização concluída: ${syncedCount} coleta(s) enviada(s) para a central!`, 'success', 3500);
      } else {
        showToast('Nenhuma nova coleta pendente para sincronizar.', 'success', 2500);
      }
    }, 700);
  }

  // 11. Monitoramento de Rede e Eventos Online/Offline
  function updateNetworkAndSyncUI() {
    state.isOnline = navigator.onLine;

    if (DOM.networkBadge) {
      DOM.networkBadge.className = `network-badge ${state.isOnline ? 'online' : 'offline'}`;
      DOM.networkLabel.textContent = state.isOnline ? 'Online' : 'Modo Offline';
    }

    if (state.isOnline) {
      DOM.btnManualSync.disabled = false;
    } else {
      DOM.btnManualSync.disabled = true;
    }
  }

  function handleOnlineEvent() {
    updateNetworkAndSyncUI();
    showToast('Conexão restabelecida! Iniciando sincronização automática...', 'success', 3000);
    // Auto-sincroniza a fila offline assim que a conexão volta
    syncAllPending();
  }

  function handleOfflineEvent() {
    updateNetworkAndSyncUI();
    showToast('Aparelho sem conexão. Ativando modo Offline-First na beira da lagoa.', 'warning', 4000);
  }

  // 12. Feedback Toast Flutuante
  let toastTimer = null;
  function showToast(message, type = 'success', duration = 3000) {
    if (!DOM.toastAlert) return;
    clearTimeout(toastTimer);

    DOM.toastAlert.textContent = message;
    DOM.toastAlert.className = `toast-alert ${type}`;
    DOM.toastAlert.hidden = false;

    toastTimer = setTimeout(() => {
      DOM.toastAlert.hidden = true;
    }, duration);
  }

  // 13. Event Listeners e Configuração
  function setupEventListeners() {
    // Clique no mapa da lagoa
    if (DOM.fieldMapContainer) {
      DOM.fieldMapContainer.addEventListener('click', handleMapClick);
    }

    // Botão GPS
    if (DOM.btnUseGps) {
      DOM.btnUseGps.addEventListener('click', handleUseGps);
    }

    // Seletor de ponto pré-cadastrado
    if (DOM.pointSelect) {
      DOM.pointSelect.addEventListener('change', () => {
        const val = DOM.pointSelect.value;
        if (PRESET_POINTS[val]) {
          const pt = PRESET_POINTS[val];
          updateMapCoordinates(pt.lat, pt.lng, pt.xPercent, pt.yPercent);
        }
      });
    }

    // Validação estrita de pH em tempo real
    if (DOM.inputPh) {
      DOM.inputPh.addEventListener('input', validatePhStrict);
      DOM.inputPh.addEventListener('blur', validatePhStrict);
    }

    // Upload e foto da amostra
    if (DOM.btnTriggerPhoto) {
      DOM.btnTriggerPhoto.addEventListener('click', () => {
        DOM.samplePhotoInput.click();
      });
    }

    if (DOM.samplePhotoInput) {
      DOM.samplePhotoInput.addEventListener('change', handlePhotoUpload);
    }

    if (DOM.btnRemovePhoto) {
      DOM.btnRemovePhoto.addEventListener('click', removePhoto);
    }

    // Envio do formulário
    if (DOM.form) {
      DOM.form.addEventListener('submit', handleFormSubmit);
    }

    // Botão Limpar Formulário
    if (DOM.btnResetForm) {
      DOM.btnResetForm.addEventListener('click', () => {
        if (confirm('Deseja limpar todos os campos do formulário de coleta?')) {
          DOM.form.reset();
          removePhoto();
          clearPhError();
          refreshTimestamp();
          if (PRESET_POINTS.P1) {
            updateMapCoordinates(PRESET_POINTS.P1.lat, PRESET_POINTS.P1.lng, PRESET_POINTS.P1.xPercent, PRESET_POINTS.P1.yPercent);
          }
        }
      });
    }

    // Botão Sincronizar Manual
    if (DOM.btnManualSync) {
      DOM.btnManualSync.addEventListener('click', () => {
        if (!state.isOnline) {
          showToast('Dispositivo sem conexão de rede. Conecte-se para sincronizar.', 'warning');
          return;
        }
        syncAllPending();
      });
    }

    // Limpar fila offline de coletas sincronizadas
    if (DOM.btnClearQueue) {
      DOM.btnClearQueue.addEventListener('click', () => {
        const pendingCount = state.offlineQueue.filter(i => i.syncStatus === 'pending').length;
        if (pendingCount > 0) {
          if (!confirm(`Ainda existem ${pendingCount} coletas pendentes! Deseja realmente limpar?`)) {
            return;
          }
        }
        state.offlineQueue = [];
        saveOfflineQueue();
        showToast('Fila de coletas limpa.', 'success');
      });
    }

    // Eventos de conectividade do navegador
    window.addEventListener('online', handleOnlineEvent);
    window.addEventListener('offline', handleOfflineEvent);
  }

  // 14. Inicialização do Módulo Especialista
  function bootstrap() {
    refreshTimestamp();
    loadOfflineQueue();
    setupEventListeners();

    // Posiciona no Ponto 1 por padrão
    if (PRESET_POINTS.P1) {
      updateMapCoordinates(PRESET_POINTS.P1.lat, PRESET_POINTS.P1.lng, PRESET_POINTS.P1.xPercent, PRESET_POINTS.P1.yPercent);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
