(() => {
    const SCROLL_BOUNDARY = 24;

    function detectLevel(lineText) {
        if (lineText.startsWith('[ERROR]')) {
            return 'error';
        }
        if (lineText.startsWith('[WARNING]')) {
            return 'warning';
        }
        if (lineText.startsWith('[DEBUG]')) {
            return 'debug';
        }
        if (lineText.startsWith('[INFO]')) {
            return 'info';
        }
        return 'default';
    }

    function createLineElement(lineText) {
        const lineElement = document.createElement('div');
        const levelName = detectLevel(lineText);
        lineElement.classList.add('log-line', `log-line-${levelName}`);
        lineElement.textContent = lineText;
        return lineElement;
    }

    function updateStatus(statusElement, label, stateName) {
        if (!statusElement) {
            return;
        }
        statusElement.textContent = label;
        statusElement.dataset.state = stateName;
    }

    function handleScroll(state) {
        const scrollDifference = state.output.scrollHeight - (state.output.scrollTop + state.output.clientHeight);
        if (scrollDifference <= SCROLL_BOUNDARY) {
            state.autoScroll = true;
        } else {
            state.autoScroll = false;
        }
    }

    function appendLine(state, lineText) {
        if (!lineText) {
            return;
        }
        if (lineText === '__heartbeat__') {
            return;
        }
        const lineElement = createLineElement(lineText);
        state.output.appendChild(lineElement);
        if (state.autoScroll) {
            state.output.scrollTop = state.output.scrollHeight;
        }
    }

    function createEventSource(state) {
        try {
            const eventSource = new EventSource(state.streamUrl);
            state.eventSource = eventSource;

            eventSource.onopen = () => {
                updateStatus(state.status, 'Conectado', 'connected');
            };

            eventSource.onmessage = (event) => {
                appendLine(state, event.data);
                if (event.data && event.data !== '__heartbeat__') {
                    updateStatus(state.status, 'Conectado', 'connected');
                }
            };

            eventSource.onerror = () => {
                updateStatus(state.status, 'Reconectando...', 'reconnecting');
            };
        } catch (error) {
            updateStatus(state.status, 'Erro ao conectar', 'error');
            console.error('Falha ao iniciar EventSource', error);
        }
    }

    function initWrapper(wrapper) {
        const streamUrl = wrapper.dataset.logStream;
        if (!streamUrl) {
            return;
        }
        const outputElement = wrapper.querySelector('[data-log-output]');
        if (!outputElement) {
            return;
        }
        const statusElement = wrapper.querySelector('[data-log-status]');
        const state = {
            wrapper,
            output: outputElement,
            status: statusElement,
            streamUrl,
            autoScroll: true,
            eventSource: null
        };

        updateStatus(statusElement, 'Conectando...', 'connecting');

        outputElement.addEventListener('scroll', () => {
            handleScroll(state);
        });

        createEventSource(state);

        wrapper._logStreamState = state;
    }

    function destroyWrapper(wrapper) {
        const state = wrapper._logStreamState;
        if (!state) {
            return;
        }
        if (state.eventSource) {
            state.eventSource.close();
        }
        delete wrapper._logStreamState;
    }

    function mountAll() {
        document.querySelectorAll('[data-log-stream]').forEach((wrapper) => {
            initWrapper(wrapper);
        });
    }

    document.addEventListener('DOMContentLoaded', mountAll);
    window.addEventListener('beforeunload', () => {
        document.querySelectorAll('[data-log-stream]').forEach((wrapper) => {
            destroyWrapper(wrapper);
        });
    });
})();

