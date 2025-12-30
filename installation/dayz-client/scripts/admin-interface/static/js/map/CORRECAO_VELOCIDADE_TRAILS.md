# Correção: Cálculo de Velocidade nos Trails

**Data:** 30 de Dezembro de 2025  
**Arquivos Modificados:**
- `map-players.js`
- `map-vehicles.js`

---

## Problema Identificado

O cálculo de velocidade exibido no tooltip dos pontos dos trails estava **incorreto** devido à ordem invertida dos dados.

### Como Funcionava Antes (ERRADO)

Os dados do backend chegam ordenados do **mais recente para o mais antigo**:
```javascript
normalPoints[0] = ponto MAIS RECENTE (ex: 10:00:10)
normalPoints[1] = ponto do meio      (ex: 10:00:05)
normalPoints[2] = ponto MAIS ANTIGO  (ex: 10:00:00)
```

O loop processava os marcadores usando `normalPoints` diretamente:
```javascript
for (let i = 0; i < normalPoints.length; i++) {
    const point = normalPoints[i].data;           // Ponto atual
    if (i > 0) {
        const prevPoint = normalPoints[i - 1].data; // "Anterior" (mais RECENTE!)
        // Calculava velocidade de um ponto FUTURO até o ponto atual ❌
    }
}
```

### Consequências do Bug

1. **Velocidade calculada da forma errada**: O tooltip mostrava "desde último ponto" mas na verdade mostrava a velocidade desde o próximo ponto (futuro) até o atual
2. **Ponto mais recente sem velocidade**: O ponto mais importante (mais recente) nunca mostrava velocidade porque `i > 0` era falso
3. **Detecção de velocidade suspeita incorreta**: Marcadores vermelhos de "VELOCIDADE SUSPEITA" podiam estar nos pontos errados

### Exemplo Prático do Problema

Jogador fez este trajeto:
```
10:00:00 → A (X=1000) 
10:00:05 → B (X=1050) [andou 50m em 5s = 36 km/h]
10:00:10 → C (X=1100) [andou 50m em 5s = 36 km/h]
```

**Backend retorna:**
```javascript
normalPoints[0] = C (10:00:10, X=1100)
normalPoints[1] = B (10:00:05, X=1050)
normalPoints[2] = A (10:00:00, X=1000)
```

**Código antigo calculava para ponto B:**
```javascript
point = normalPoints[1]     // B (10:00:05)
prevPoint = normalPoints[0] // C (10:00:10) ← ERRADO! É o futuro!
// Calculava velocidade de C→B ao invés de A→B
```

---

## Solução Implementada

### Mudança Principal

Usar `reversedTrail` (ordem cronológica correta) ao invés de `normalPoints`:

```javascript
// Inverter para ordem cronológica
const reversedTrail = normalPoints.slice().reverse();
// reversedTrail[0] = ponto MAIS ANTIGO
// reversedTrail[n] = ponto MAIS RECENTE

// Loop usando reversedTrail
for (let i = 0; i < reversedTrail.length; i++) {
    const point = reversedTrail[i].data;           // Ponto atual
    if (i > 0) {
        const prevPoint = reversedTrail[i - 1].data; // Agora SIM é o anterior ✓
        // Calcula velocidade do ponto anterior até o atual
    }
}
```

### Correções Específicas

#### 1. map-players.js (Linhas 920-998)

**Antes:**
```javascript
for (let i = 0; i < normalPoints.length; i++) {
    const point = normalPoints[i].data;
    tooltipText += `<strong>📍 Ponto ${normalPoints.length - i}</strong><br>`;
    if (i > 0) {
        const prevPoint = normalPoints[i - 1].data;
        // ... cálculo de velocidade ...
    }
    // Criar marcador em normalPoints[i].mapCoords
}
```

**Depois:**
```javascript
for (let i = 0; i < reversedTrail.length; i++) {
    const point = reversedTrail[i].data;
    tooltipText += `<strong>📍 Ponto ${i + 1}</strong><br>`;
    if (i > 0) {
        const prevPoint = reversedTrail[i - 1].data;
        // ... cálculo de velocidade correto ...
    }
    // Criar marcador em reversedTrail[i].mapCoords
}
```

#### 2. map-vehicles.js (Linhas 386-435)

**Antes:**
```javascript
// Sem reversão do array
const latlngs = processedTrail.map(item => item.mapCoords);
for (let i = 0; i < processedTrail.length; i++) {
    const point = processedTrail[i].data;
    tooltipText += `<strong>📍 Ponto ${processedTrail.length - i}</strong><br>`;
    if (i > 0) {
        const prevPoint = processedTrail[i - 1].data;
        // ... cálculo incorreto ...
    }
}
```

**Depois:**
```javascript
// Reverter para ordem cronológica
const reversedTrail = processedTrail.slice().reverse();
const latlngs = reversedTrail.map(item => item.mapCoords);
for (let i = 0; i < reversedTrail.length; i++) {
    const point = reversedTrail[i].data;
    tooltipText += `<strong>📍 Ponto ${i + 1}</strong><br>`;
    if (i > 0) {
        const prevPoint = reversedTrail[i - 1].data;
        // ... cálculo correto ...
    }
}
```

---

## Resultado da Correção

### ✅ Agora Funciona Corretamente

1. **Velocidade correta**: Mostra a velocidade do ponto cronologicamente anterior até o ponto atual
2. **Todos os pontos com velocidade**: Todos os pontos (exceto o primeiro) mostram velocidade
3. **Detecção precisa**: Marcadores de "VELOCIDADE SUSPEITA" agora aparecem nos pontos corretos
4. **Numeração lógica**: Pontos numerados de 1 (mais antigo) até N (mais recente)

### Fórmulas (Mantidas Corretas)

As fórmulas matemáticas sempre estiveram corretas, o problema era apenas a ordem dos dados:

```javascript
// Distância (Teorema de Pitágoras)
distance = √(Δx² + Δy²)  // em metros

// Tempo
timeDiff = |timestamp2 - timestamp1| / 1000  // em segundos

// Velocidade
speed = (distance / timeDiff) * 3.6  // km/h
```

---

## Teste de Validação

Para validar a correção:

1. Ativar trails de um jogador conhecido
2. Passar o mouse nos pontos do trail
3. Verificar que a velocidade faz sentido cronologicamente
4. Confirmar que o ponto mais recente (último da linha) agora mostra velocidade
5. Verificar que pontos suspeitos (>50 km/h) estão marcados corretamente

---

## Observações

- Containers não têm cálculo de velocidade (correto, pois não se movem)
- A detecção de velocidade suspeita usa threshold de **50 km/h** com tempo mínimo de **5 segundos** e distância mínima de **10 metros** para evitar falsos positivos
- Isso é especialmente útil para detectar teleportes ou speed hacks

---

**Autor da Correção:** Sistema de IA  
**Validado em:** 30/12/2025

