/**
 * Modulo de Timeline Interativa para Trails
 * Permite navegacao visual pelo tempo para visualizar trajetos de jogadores
 */

const MapTimeline = {
    // Estado
    enabled: false,
    liveMode: true,           // Modo tempo real (atualiza automaticamente com auto-refresh)
    currentDate: null,        // Date object (apenas data)
    currentPosition: 0,       // Posicao em minutos desde 00:00 (0-1439)
    windowMinutes: 10,        // Tamanho da janela em minutos (padrao 10 min)
    isPlaying: false,
    playInterval: null,
    playSpeed: 1000,          // ms entre atualizacoes
    isDragging: false,

    // Elementos DOM (cache)
    elements: {},

    // Inicializacao
    init: function() {
        this.cacheElements();
        this.bindEvents();
        this.setDefaultDate();
        this.generateTicks();
    },

    cacheElements: function() {
        this.elements = {
            container: $('#trailTimeline'),
            dateInput: $('#timelineDate'),
            bar: $('#timelineBar'),
            cursor: $('#timelineCursor'),
            currentRange: $('#timelineCurrentRange'),
            ticks: $('#timelineTicks'),
            activity: $('#timelineActivity'),
            windowSelect: $('#timelineWindow'),
            speedSelect: $('#timelineSpeed'),
            playBtn: $('#timelinePlay')
        };
    },

    bindEvents: function() {
        const self = this;

        // Navegacao de data
        $('#timelinePrevDay').on('click', function() { self.changeDate(-1); });
        $('#timelineNextDay').on('click', function() { self.changeDate(1); });
        this.elements.dateInput.on('change', function() { self.onDateChange(); });

        // Controles de navegacao
        $('#timelineBackward').on('click', function() { self.stepBy(-self.windowMinutes); });
        $('#timelineForward').on('click', function() { self.stepBy(self.windowMinutes); });
        $('#timelineStepBack').on('click', function() { self.stepBy(-1); });
        $('#timelineStepForward').on('click', function() { self.stepBy(1); });

        // Auto-play
        this.elements.playBtn.on('click', function() { self.togglePlay(); });
        this.elements.speedSelect.on('change', function() { self.updateSpeed(); });

        // Botao Ao Vivo (toggle)
        $('#timelineLiveBtn').on('click', function() { self.toggleLiveMode(); });

        // Janela de tempo
        this.elements.windowSelect.on('change', function() { self.updateWindow(); });

        // Filtro de backups
        $('#showBackupCheck').on('change', function() {
            MapState.showBackupMarkers = $(this).is(':checked');
            // Recarregar trails para aplicar filtro
            if (MapState.showTrails) {
                self.updateTrails();
            }
        });

        // Clique na barra
        this.elements.bar.on('click', function(e) { self.onBarClick(e); });

        // Drag na barra
        this.elements.bar.on('mousedown', function(e) { self.startDrag(e); });
        $(document).on('mousemove', function(e) { self.onDrag(e); });
        $(document).on('mouseup', function() { self.endDrag(); });

        // Teclas de atalho quando timeline ativa
        $(document).on('keydown', function(e) {
            if (!self.enabled) return;

            // Ignorar se estiver em um input
            if ($(e.target).is('input, textarea, select')) return;

            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    self.stepBy(e.shiftKey ? -self.windowMinutes : -1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    self.stepBy(e.shiftKey ? self.windowMinutes : 1);
                    break;
                case ' ':
                    e.preventDefault();
                    self.togglePlay();
                    break;
            }
        });
    },

    // Habilitar/Desabilitar
    enable: function() {
        this.enabled = true;
        this.liveMode = true;  // Sempre inicia em modo tempo real

        // Atualizar para data/hora atual (refresh)
        this.currentDate = new Date();
        this.currentPosition = this.getCurrentMinutes();
        this.elements.dateInput.val(this.formatDateForInput(this.currentDate));

        // Definir filtro de data ANTES de mostrar (para primeira requisicao)
        this.setDateFilter();

        this.elements.container.show();
        this.updateDisplay();
        this.updateLiveModeIndicator();
        this.loadActivityIndicators();
    },

    // Define o filtro de data baseado na posicao atual
    // A janela de tempo TERMINA em currentPosition e COMECA windowMinutes antes
    setDateFilter: function() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const day = this.currentDate.getDate();

        // Calcular posicao inicial (windowMinutes ANTES da posicao atual)
        const startPosition = Math.max(this.currentPosition - this.windowMinutes, 0);
        const startHours = Math.floor(startPosition / 60);
        const startMins = startPosition % 60;

        // Posicao final e a posicao atual
        const endHours = Math.floor(this.currentPosition / 60);
        const endMins = this.currentPosition % 60;

        const startDate = new Date(year, month, day, startHours, startMins, 0, 0);
        const endDate = new Date(year, month, day, endHours, endMins, 0, 0);

        MapState.trailDateFilter.enabled = true;
        MapState.trailDateFilter.startDate = startDate;
        MapState.trailDateFilter.endDate = endDate;
    },

    // Atualiza para o momento atual (chamado pelo auto-refresh)
    refreshToNow: function() {
        if (!this.enabled || !this.liveMode) return;

        // Atualizar para data/hora atual
        this.currentDate = new Date();
        this.currentPosition = this.getCurrentMinutes();
        this.elements.dateInput.val(this.formatDateForInput(this.currentDate));

        // Atualizar filtro e display
        this.setDateFilter();
        this.updateDisplay();
    },

    // Ativa modo tempo real e atualiza para agora
    // fromAutoRefresh: true se chamado pelo toggleAutoRefresh (evita recursao)
    enableLiveMode: function(fromAutoRefresh) {
        this.liveMode = true;
        this.updateLiveModeIndicator();
        this.refreshToNow();
        this.updateTrails();

        // Sincronizar com checkbox de auto-refresh
        if (!fromAutoRefresh && !$('#autoRefreshCheck').is(':checked')) {
            $('#autoRefreshCheck').prop('checked', true);
            if (typeof toggleAutoRefresh === 'function') {
                toggleAutoRefresh();
            }
        }
    },

    // Desativa modo tempo real (chamado quando usuario navega manualmente)
    // fromAutoRefresh: true se chamado pelo toggleAutoRefresh (evita recursao)
    disableLiveMode: function(fromAutoRefresh) {
        this.liveMode = false;
        this.updateLiveModeIndicator();

        // Sincronizar com checkbox de auto-refresh
        if (!fromAutoRefresh && $('#autoRefreshCheck').is(':checked')) {
            $('#autoRefreshCheck').prop('checked', false);
            if (typeof toggleAutoRefresh === 'function') {
                toggleAutoRefresh();
            }
        }
    },

    // Toggle modo tempo real (para o botao AO VIVO)
    toggleLiveMode: function() {
        if (this.liveMode) {
            this.disableLiveMode();
        } else {
            this.enableLiveMode();
        }
    },

    // Atualiza indicador visual do modo ao vivo
    updateLiveModeIndicator: function() {
        const liveBtn = $('#timelineLiveBtn');
        if (this.liveMode) {
            liveBtn.addClass('active');
        } else {
            liveBtn.removeClass('active');
        }
    },

    disable: function() {
        this.enabled = false;
        this.stopPlay();
        this.elements.container.hide();

        // Limpar filtro de data
        MapState.trailDateFilter.enabled = false;
        MapState.trailDateFilter.startDate = null;
        MapState.trailDateFilter.endDate = null;
    },

    toggle: function() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
    },

    // Navegacao de data
    setDefaultDate: function() {
        this.currentDate = new Date();
        this.elements.dateInput.val(this.formatDateForInput(this.currentDate));
        this.currentPosition = this.getCurrentMinutes();
    },

    changeDate: function(delta) {
        this.disableLiveMode();  // Navegacao manual desativa modo tempo real
        const newDate = new Date(this.currentDate);
        newDate.setDate(newDate.getDate() + delta);
        this.currentDate = newDate;
        this.elements.dateInput.val(this.formatDateForInput(this.currentDate));
        this.onDateChange();
    },

    onDateChange: function() {
        this.disableLiveMode();  // Mudanca de data desativa modo tempo real
        const dateStr = this.elements.dateInput.val();
        if (dateStr) {
            const parts = dateStr.split('-').map(Number);
            this.currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
        }
        this.loadActivityIndicators();
        this.updateTrails();
    },

    // Navegacao de posicao
    goToPosition: function(minutes) {
        this.disableLiveMode();  // Navegacao manual desativa modo tempo real
        this.currentPosition = Math.max(0, Math.min(1439, minutes));
        this.updateDisplay();
        this.updateTrails();
    },

    stepBy: function(minutes) {
        this.goToPosition(this.currentPosition + minutes);
    },

    onBarClick: function(e) {
        if (this.isDragging) return;

        const rect = this.elements.bar[0].getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        const minutes = Math.round(percent * 1439);
        this.goToPosition(minutes);
    },

    // Drag
    startDrag: function(e) {
        this.isDragging = true;
        this.elements.bar.css('cursor', 'grabbing');
        this.onDrag(e);
    },

    onDrag: function(e) {
        if (!this.isDragging) return;

        const rect = this.elements.bar[0].getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percent = x / rect.width;
        const minutes = Math.round(percent * 1439);

        this.currentPosition = minutes;
        this.updateDisplay();
    },

    endDrag: function() {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.elements.bar.css('cursor', 'pointer');
        this.updateTrails();
    },

    // Auto-play
    togglePlay: function() {
        if (this.isPlaying) {
            this.stopPlay();
        } else {
            this.startPlay();
        }
    },

    startPlay: function() {
        const self = this;
        this.isPlaying = true;
        this.elements.playBtn.html('&#10074;&#10074;').addClass('active');

        this.playInterval = setInterval(function() {
            self.stepBy(1);  // Avança 1 minuto por vez, janela se move junto

            // Parar no final do dia
            if (self.currentPosition >= 1439) {
                self.stopPlay();
            }
        }, this.playSpeed);
    },

    stopPlay: function() {
        this.isPlaying = false;
        this.elements.playBtn.html('&#9654;').removeClass('active');

        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    },

    updateSpeed: function() {
        this.playSpeed = parseInt(this.elements.speedSelect.val());
        if (this.isPlaying) {
            this.stopPlay();
            this.startPlay();
        }
    },

    updateWindow: function() {
        this.windowMinutes = parseInt(this.elements.windowSelect.val());
        this.updateDisplay();
        this.updateTrails();
    },

    // Atualizacao visual
    updateDisplay: function() {
        // Calcular posicao inicial (janela ANTES de currentPosition)
        const startPosition = Math.max(this.currentPosition - this.windowMinutes, 0);

        // Posicionar cursor (comeca em startPosition e termina em currentPosition)
        const startPercent = startPosition / 1439 * 100;
        const windowPercent = this.windowMinutes / 1439 * 100;

        this.elements.cursor.css({
            left: startPercent + '%',
            width: windowPercent + '%'
        });

        // Atualizar texto do horario (janela de startPosition ate currentPosition)
        const startTime = this.formatTime(startPosition);
        const endTime = this.formatTime(this.currentPosition);
        this.elements.currentRange.text(startTime + ' - ' + endTime);
    },

    // Atualizacao dos trails
    updateTrails: function() {
        if (!this.enabled) return;

        // Atualizar filtro de data
        this.setDateFilter();

        // Coletar jogadores para carregar (mesma logica do toggleTrails)
        const playerIdsToLoad = [];
        const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');

        Object.keys(MapState.playersData).forEach(function(playerId) {
            const playerData = MapState.playersData[playerId];

            // Se filtro de INCLUSAO esta ativo, so carrega selecionados
            if (MapState.selectedPlayerFilters.length > 0) {
                if (!MapState.selectedPlayerFilters.includes(playerId)) {
                    return;
                }
            }

            // Se "Apenas Online" esta marcado
            if (onlineOnlyFilterActive && !playerData.isOnline) {
                return;
            }

            // Se filtro de EXCLUSAO esta ativo
            if (MapState.selectedPlayerFilters.length === 0 &&
                MapState.excludedPlayerFilters.includes(playerId)) {
                return;
            }

            playerIdsToLoad.push(playerId);
        });

        // Carregar trails
        if (playerIdsToLoad.length > 0) {
            loadPlayerTrailsBatch(playerIdsToLoad);
        }
    },

    // Gerar ticks (marcacoes de hora)
    generateTicks: function() {
        let html = '';
        for (let h = 0; h <= 24; h++) {
            const percent = h / 24 * 100;
            html += '<div class="timeline-tick" style="left: ' + percent + '%">';
            if (h % 3 === 0) { // Mostrar label a cada 3 horas
                html += '<span class="timeline-tick-label">' + h.toString().padStart(2, '0') + 'h</span>';
            }
            html += '</div>';
        }
        this.elements.ticks.html(html);
    },

    // Carregar indicadores de atividade (heatmap)
    loadActivityIndicators: function() {
        if (!this.currentDate) return;

        const self = this;
        const dateStr = this.formatDateForInput(this.currentDate);
        const playerIds = MapState.selectedPlayerFilters ? MapState.selectedPlayerFilters.join(',') : '';

        $.get('/api/players/activity/hourly', {
            date: dateStr,
            player_ids: playerIds
        })
        .done(function(data) {
            self.renderActivityHeatmap(data.activity, data.max_count);
        })
        .fail(function() {
            // Limpar heatmap em caso de erro
            self.elements.activity.html('');
        });
    },

    renderActivityHeatmap: function(activity, maxCount) {
        if (!maxCount) {
            this.elements.activity.html('');
            return;
        }

        let html = '';
        const self = this;

        activity.forEach(function(item) {
            const percent = item.hour / 24 * 100;
            const width = 100 / 24;
            const intensity = item.count / maxCount;

            // Cor: verde (baixo) -> amarelo (medio) -> vermelho (alto)
            let color;
            if (intensity < 0.33) {
                const alpha = 0.3 + intensity * 0.7;
                color = 'rgba(46, 204, 113, ' + alpha + ')'; // Verde
            } else if (intensity < 0.66) {
                const alpha = 0.3 + intensity * 0.7;
                color = 'rgba(241, 196, 15, ' + alpha + ')'; // Amarelo
            } else {
                const alpha = 0.3 + intensity * 0.7;
                color = 'rgba(231, 76, 60, ' + alpha + ')'; // Vermelho
            }

            if (item.count > 0) {
                html += '<div class="timeline-activity-bar" ' +
                    'style="left: ' + percent + '%; width: ' + width + '%; background: ' + color + ';" ' +
                    'title="' + item.hour + 'h: ' + item.count + ' posicoes"></div>';
            }
        });

        this.elements.activity.html(html);
    },

    // Helpers
    formatDateForInput: function(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return year + '-' + month + '-' + day;
    },

    formatTime: function(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
    },

    getCurrentMinutes: function() {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    },

    // Metodo para atualizar quando jogadores selecionados mudam
    onPlayerSelectionChange: function() {
        if (this.enabled) {
            this.loadActivityIndicators();
            this.updateTrails();
        }
    }
};

// Inicializar quando documento estiver pronto
$(document).ready(function() {
    MapTimeline.init();
});
