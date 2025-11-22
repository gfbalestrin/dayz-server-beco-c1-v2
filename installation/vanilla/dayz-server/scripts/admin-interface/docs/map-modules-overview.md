# Visão Geral da Arquitetura Modular do Mapa

## Introdução

Este documento descreve a arquitetura modular do sistema de mapa do DayZ Admin Interface. O arquivo original `map.js` (5814 linhas) foi refatorado em 12 módulos menores e organizados por funcionalidade.

## Estrutura de Módulos

### Hierarquia de Dependências

```
map.js (principal)
├── map-utils.js (sem dependências)
├── map-icons.js (depende de: utils)
├── map-core.js (depende de: utils)
├── map-history.js (depende de: utils)
├── map-notifications.js (independente)
├── map-players.js (depende de: core, icons, utils, history, notifications)
├── map-vehicles.js (depende de: core, icons, utils, history, notifications)
├── map-containers.js (depende de: core, icons, utils, history, notifications)
├── map-fences.js (depende de: core, icons, utils, history, notifications)
├── map-events.js (depende de: core, icons, utils, notifications)
└── map-teleport.js (depende de: core, utils, players, vehicles)
```

## Módulos

### 1. map-utils.js
**Responsabilidade**: Funções utilitárias e conversões de coordenadas
- Funções puras sem dependências externas
- Conversões entre sistemas de coordenadas
- Cálculos de direção e offset para tooltips/popups
- Geração de cores para jogadores

### 2. map-icons.js
**Responsabilidade**: Criação de ícones e marcadores Leaflet
- Funções que retornam objetos `L.divIcon`
- Ícones para jogadores, veículos, containers, construções, kills, damages
- Ícones de cluster para agrupamento

### 3. map-core.js
**Responsabilidade**: Inicialização e configuração básica do mapa
- Inicialização do mapa Leaflet
- Gerenciamento de configurações de mapa
- Troca entre diferentes mapas (topográfico/satélite)
- Limpeza de layers
- Funções de loading

### 4. map-history.js
**Responsabilidade**: Funções auxiliares para históricos e trails
- Validação de trails (pontos iguais)
- Geração de tooltips consolidados
- Formatação de histórico

### 5. map-notifications.js
**Responsabilidade**: Sistema de notificações e log
- Gerenciamento de notificações (ativar/desativar)
- Log de eventos em tempo real
- Interface visual do log abaixo do mapa

### 6. map-players.js
**Responsabilidade**: Lógica completa de jogadores e escaneamento
- Carregamento e atualização de posições
- Detecção de mudanças
- Sistema de trails
- Filtros de jogadores
- Ações: teleporte, backup, clonagem, inventário
- Escaneamento de objetos em região do mapa
- Marcação de objetos escaneados no mapa
- Polling de resultados de comandos

### 7. map-vehicles.js
**Responsabilidade**: Lógica de veículos
- Carregamento e atualização
- Detecção de mudanças
- Trails de veículos
- Popups com informações detalhadas

### 8. map-containers.js
**Responsabilidade**: Lógica de containers
- Carregamento e atualização
- Detecção de mudanças
- Trails de containers
- Histórico de loot
- Clustering de marcadores

### 9. map-fences.js
**Responsabilidade**: Lógica de construções (fences, watchtowers, flags)
- Carregamento e atualização
- Detecção de mudanças
- Histórico de alterações
- Popups detalhados por tipo de construção

### 10. map-events.js
**Responsabilidade**: Eventos de kills e damages
- Carregamento de eventos
- Detecção de novos eventos
- Visualização no mapa (marcadores e linhas)
- Ações de teleporte para posições de eventos

### 11. map-teleport.js
**Responsabilidade**: Sistema de teleporte e escaneamento
- Modos de interação (normal/teleporte/scan)
- Teleporte de jogadores
- Teleporte de veículos
- Escaneamento de região do mapa
- Círculo visual de raio de escaneamento
- Interface e validações

### 12. map.js
**Responsabilidade**: Arquivo principal - orquestração
- Inicialização geral
- Event listeners principais
- Auto-refresh
- Coordenação entre módulos

## Convenções de Nomenclatura

### Variáveis Globais
- Variáveis compartilhadas entre módulos são acessadas via `MapState`
- Variáveis locais de módulo usam prefixo quando necessário (ex: `playerMarkers`)

### Funções
- Nomes descritivos em camelCase
- Prefixos indicam categoria:
  - `create*` - Criação de objetos
  - `load*` - Carregamento de dados
  - `update*` - Atualização de estado
  - `toggle*` - Alternância de estado
  - `detect*` - Detecção de mudanças
  - `show*` - Exibição de modais/UI
  - `execute*` - Execução de ações

### Arquivos
- Prefixo `map-` para todos os módulos
- Sufixo descritivo da funcionalidade
- `map.js` é o arquivo principal

## Padrões de Uso

### Compartilhamento de Estado
- Estado global compartilhado via objeto `MapState`
- Cada módulo gerencia seu próprio estado local
- Comunicação entre módulos via funções públicas

### Dependências
- Módulos são carregados na ordem de dependências
- Verificações de inicialização quando necessário
- Documentação clara de dependências

### Eventos
- Event listeners registrados no módulo principal
- Módulos expõem funções públicas para serem chamadas
- Comunicação via callbacks quando necessário

## Benefícios da Arquitetura

1. **Manutenibilidade**: Código organizado por responsabilidade
2. **Testabilidade**: Módulos podem ser testados isoladamente
3. **Reutilização**: Funções utilitárias podem ser reutilizadas
4. **Performance**: Carregamento otimizado e cache granular
5. **IA-Friendly**: Contexto mais focado para assistentes de IA

