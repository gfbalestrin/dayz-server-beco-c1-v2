# Mapa do Servidor - Rastreamento em Tempo Real

## Visão Geral

Esta funcionalidade permite visualizar em tempo real a posição de todos os jogadores no mapa do Chernarus, com suporte a trails de movimento, filtros avançados e atualização automática.

## Funcionalidades

### 🗺️ Visualização do Mapa
- Mapa completo do Chernarus (4096×4096 pixels)
- Zoom e pan suaves
- Coordenadas DayZ convertidas automaticamente
- Tooltips com informações dos jogadores

### 🎯 Marcadores de Jogadores
- Cada jogador tem uma cor única
- Marcadores diferenciados (online vs offline)
- Popups com informações completas:
  - Nome do jogador
  - Steam Name
  - Coordenadas atuais (X, Y, Z)
  - Data da última atualização
  - Status online/offline

### 📍 Trails de Movimento
- Histórico de posições dos jogadores
- Linhas conectando pontos de movimento
- Cor correspondente ao jogador
- Até 100 pontos de histórico por jogador
- Toggle para mostrar/ocultar

### 🔍 Filtros Avançados

#### Filtro por Status
- **Apenas Online**: Mostra somente jogadores conectados
- Opacidade reduzida para jogadores offline

#### Filtro por Jogador
- Dropdown com todos os jogadores
- Visualizar um jogador específico
- Trail completo do jogador selecionado

#### Filtro por Período
- (Futuro) Selecionar período de tempo
- Ver histórico de posições em um período

### ⏱️ Auto-Refresh
- Atualização automática a cada 10 segundos
- Indicador de última atualização
- Botão para atualizar manualmente
- Toggle para ligar/desligar

### 🎨 Interface
- Design responsivo
- Controles intuitivos
- Loading indicators
- Popups informativos
- Responsive para mobile

## Como Usar

### Acessar o Mapa
1. Acesse "Mapa" no menu lateral
2. O mapa será carregado automaticamente
3. Aguarde a carga das posições dos jogadores

### Visualizar Jogadores
- **Marcadores coloridos**: Cada jogador tem uma cor única
- **Clique no marcador**: Veja informações do jogador
- **Status**:
  - Marcadores opacos = jogadores online
  - Marcadores semitransparentes = jogadores offline

### Ver Trail de Movimento
1. Clique no botão "Mostrar Trails"
2. Todos os trails serão exibidos
3. Ou clique em um marcador para ver só aquele trail
4. Clique novamente para ocultar

### Filtrar Jogadores
1. **Apenas Online**: Marque o checkbox para ver só online
2. **Por Jogador**: Selecione um jogador no dropdown
3. **Limpar**: Selecione "Todos" no dropdown

### Atualização Automática
- **Ligar**: Marque o checkbox "Auto-Refresh: Ligado"
- **Desligar**: Desmarque o checkbox
- **Manual**: Clique em "Atualizar"

## Sistema de Coordenadas

### Conversão DayZ → Pixels
```
Chernarus: 15360 metros × 15360 metros
Imagem:    4096 pixels × 4096 pixels
Fator:     3.75 metros por pixel
```

### Exemplo
```
Coordenada DayZ: X=7500, Z=8000
Pixel correspondente: 
  - X = (7500 / 15360) × 4096 = 2000 pixels
  - Z = (8000 / 15360) × 4096 = 2133 pixels
```

## APIs

### GET `/api/players/positions`
Retorna posições atuais de todos os jogadores.

**Resposta:**
```json
{
  "timestamp": "2024-10-26T15:30:00",
  "players": [
    {
      "player_id": "abc123",
      "player_name": "Jogador1",
      "steam_name": "Steam1",
      "coord_x": 7500.5,
      "coord_y": 150.2,
      "coord_z": 8000.3,
      "pixel_coords": [2133, 2000],
      "last_update": "2024-10-26T15:29:45",
      "is_online": true
    }
  ]
}
```

### GET `/api/players/online/positions`
Retorna posições apenas de jogadores online.

**Resposta:** Igual à API `/api/players/positions`

### GET `/api/players/<player_id>/trail?limit=100`
Retorna histórico de movimento de um jogador.

**Parâmetros:**
- `limit`: Número de pontos (padrão: 100)

**Resposta:**
```json
{
  "player_id": "abc123",
  "trail": [
    {
      "coord_x": 7500.5,
      "coord_y": 150.2,
      "coord_z": 8000.3,
      "pixel_coords": [2133, 2000],
      "timestamp": "2024-10-26T15:29:45"
    }
  ]
}
```

## Estrutura de Arquivos

```
admin-interface/
├── templates/
│   └── map.html              # Template do mapa
├── static/
│   ├── js/
│   │   └── map.js            # Lógica do mapa
│   ├── css/
│   │   └── map.css          # Estilos do mapa
│   └── img/
│       └── chernarus.jpeg   # Imagem do mapa
├── database.py              # Funções de query
└── app.py                   # Rotas da API
```

## Tecnologias

- **Leaflet.js 1.9.4**: Biblioteca de mapas interativos
- **jQuery**: Manipulação DOM e AJAX
- **Bootstrap 5**: Interface UI
- **Font Awesome**: Ícones

## Performance

- **Cache**: 30 segundos nas APIs
- **Limite de trails**: 100 pontos por jogador
- **Auto-refresh**: 10 segundos (configurável)
- **Lazy loading**: Trails só carregados quando solicitados

## Troubleshooting

### Problema: Mapa não carrega
- Verifique se a imagem `chernarus.jpeg` existe em `static/img/`
- Verifique o console do navegador para erros

### Problema: Marcadores não aparecem
- Verifique se há dados no banco `players_beco_c1.db`
- Verifique se as APIs estão respondendo

### Problema: Trails não aparecem
- Verifique se há dados na tabela `players_coord`
- Verifique o console para erros de AJAX

### Problema: Performance lenta
- Reduza o `limit` dos trails
- Aumente o intervalo de auto-refresh
- Desabilite auto-refresh se não precisar

## Melhorias Futuras

- [ ] Heatmap de áreas mais visitadas
- [ ] Marcadores de eventos (kills/deaths)
- [ ] Clustering para muitos jogadores
- [ ] Medição de distância
- [ ] Exportar mapa para imagem
- [ ] Gráfico de velocidade de movimento
- [ ] Análise de padrões de movimento

---

**Beco Gaming** - DayZ Server Admin Interface
