# Documentação Técnica: dayz-perf-check.sh
## Análise de Métricas de Performance para Servidor DayZ em VPS

---

## 1. Contexto e Objetivo

### 1.1 Problema Identificado
O servidor DayZ está rodando em uma **VPS compartilhada** onde múltiplas VMs competem pelos mesmos recursos físicos de CPU. O DayZ Server é uma aplicação **single-threaded** (mono-thread), o que significa que todo o processamento do jogo ocorre em um único core de CPU.

### 1.2 Desafio Específico
Em ambientes VPS compartilhados, o **CPU steal time** é o principal ofensor para aplicações single-threaded. Quando outros VMs no mesmo host físico consomem CPU, o hypervisor "rouba" ciclos de CPU da sua VPS, causando:
- **Teleporte de veículos**: O servidor não processa física do veículo a tempo
- **Desync de jogadores**: Atraso no processamento de posições
- **Stuttering**: Congelamentos momentâneos do servidor
- **Batidas/explosões de veículos**: Cálculos de física atrasados

### 1.3 Objetivo do Script
Coletar métricas **sistêmicas** e **específicas do processo DayZServer** para identificar gargalos, com foco especial em:
1. CPU steal time (indicador #1 de contenção em VPS)
2. Single-core performance (DayZ usa apenas 1 core)
3. Latência de I/O (afeta persistência de dados)
4. Pressão de memória

---

## 2. Métricas Coletadas

### 2.1 Informações de Sistema Base

#### **2.1.1 Uptime do Sistema**
```bash
UPTIME=$(awk '{printf "%.0f", $1}' /proc/uptime)
```
- **O que é**: Tempo em segundos desde o último boot
- **Importância**: Identifica se problemas são recorrentes ou pós-reboot
- **DayZ específico**: Servidores DayZ tendem a ter vazamento de memória gradual; uptimes muito altos podem indicar necessidade de restart periódico

#### **2.1.2 Contagem de CPUs**
```bash
CPU_COUNT=$(nproc)
```
- **O que é**: Número de cores virtuais disponíveis para a VPS
- **Importância**: Base para avaliar se há contenção de CPU (run queue)
- **DayZ específico**: DayZ usa principalmente 1 core, mas ter 2-4 cores ajuda threads auxiliares (rede, I/O)

---

### 2.2 Métricas de CPU (via mpstat)

O script coleta dados de **todos os cores** por N segundos e calcula médias:

```bash
mpstat -P ALL 1 "$SECONDS_TO_SAMPLE"
```

#### **2.2.1 CPU User Time (%usr)**
- **O que é**: Percentual de tempo executando código em user space (aplicações)
- **Valores normais**: 20-60% em servidor DayZ ativo
- **Importância**: Indica carga de trabalho real do servidor
- **DayZ específico**: Alto %usr em um único core é esperado (processamento do jogo)

#### **2.2.2 CPU System Time (%sys)**
- **O que é**: Percentual de tempo executando código do kernel (syscalls, I/O, rede)
- **Valores normais**: 5-15%
- **⚠️ Alerta**: Se %sys > 20%, pode indicar:
  - Excesso de syscalls (I/O fragmentado)
  - Overhead de rede
  - Problemas de kernel/drivers
- **DayZ específico**: Servidor com muitos jogadores e veículos gera mais syscalls de rede

#### **2.2.3 I/O Wait (%iowait)** ⭐ CRÍTICO
- **O que é**: Percentual de tempo que a CPU fica OCIOSA aguardando I/O de disco
- **Valores normais**: < 2%
- **⚠️ Zona de atenção**: 2-5%
- **🔴 Crítico**: > 5%
- **Impacto no DayZ**:
  - **< 2%**: Sem impacto perceptível
  - **2-5%**: Pode causar micro-stutters ao salvar persistência ou spawnar loot
  - **> 5%**: Travamentos perceptíveis, delay em saves, risco de rollback
- **Causas comuns em VPS**:
  - Disco compartilhado saturado (outros VMs fazendo I/O intensivo)
  - IOPS limitado pelo plano da VPS
  - Disco lento (HDD ao invés de SSD/NVMe)

#### **2.2.4 CPU Steal Time (%steal)** ⭐⭐⭐ **MÉTRICA MAIS CRÍTICA PARA VPS**
- **O que é**: Percentual de tempo que a CPU **estava pronta para executar** mas o hypervisor deu prioridade para outras VMs
- **Valores ideais**:
  - **< 1%**: Excelente (VPS não está sobrecarregada)
  - **1-3%**: Aceitável (pequenos impactos em horários de pico)
  - **> 3%**: Problemático (causa teleporte de veículos e desync)
  - **> 10%**: Crítico (servidor injogável em horários de pico)

**POR QUE É TÃO CRÍTICO PARA DAYZ?**

O DayZ processa **física de veículos** e **posições de jogadores** em um loop single-threaded a cada tick (~50ms). Quando ocorre steal time:

```
Frame N:   [Processa física] → Veículo em X=100, Y=200
           ⚠️ STEAL (hypervisor roubou 150ms)
Frame N+1: [Processa física] → Servidor pensa que se passaram 150ms
           → Cálculo errado de posição
           → Veículo "teleporta" ou colide incorretamente
```

**Sintomas de alto steal time**:
- Veículos "pulando" ou teleportando
- Jogadores desyncando
- Veículos explodindo sem motivo aparente
- Travamentos/stuttering do servidor

#### **2.2.5 CPU Idle (%idle)**
- **O que é**: Percentual de tempo que a CPU ficou totalmente ociosa
- **Valores**: Complemento de uso total (se usr+sys+iowait+steal = 40%, então idle = 60%)
- **Importância**: Indica se há margem de processamento disponível

#### **2.2.6 Core Mais Quente (Hottest CPU Core)** ⭐ MUITO IMPORTANTE PARA DAYZ
```bash
HOT_CORE_LINE=$(awk '
  /^Average:/ && $2 ~ /^[0-9]+$/ {
    cpu=$2; usr=$(NF-9); sys=$(NF-8);
    load=usr+sys;
    if(load>max){max=load; line=$0}
  }
  END{print line}
' "$MPSTAT_OUT")
```

- **O que é**: Identifica qual core individual está com maior carga (usr + sys)
- **Por que é crítico**: DayZ é **single-threaded**, então um core específico carrega todo o peso
- **Valores**:
  - **< 70%**: Saudável, servidor tem margem
  - **70-90%**: Perto do limite, mas gerenciável
  - **> 90%**: Core saturado, risco de frame drops

**Exemplo de saída**:
```
Core mais quente: CPU 2 | usr=75.3% sys=12.1% steal=2.1% idle=10.5%
```

**Interpretação**:
- Se o core mais quente está > 90% E há steal time, o servidor está em sérios problemas
- Se o core está alto mas steal é baixo, é apenas carga normal do jogo

---

### 2.3 Métricas de Memória

#### **2.3.1 Memória Total e Disponível**
```bash
MEM_TOTAL_MB=$(awk '/MemTotal/ {printf "%.0f", $2/1024}' /proc/meminfo)
MEM_AVAIL_MB=$(awk '/MemAvailable/ {printf "%.0f", $2/1024}' /proc/meminfo)
```

- **MemTotal**: RAM total alocada para a VPS
- **MemAvailable**: RAM realmente disponível (conta buffers/cache reutilizável)
- **Threshold**:
  - **> 800MB disponível**: OK
  - **< 800MB**: Pressão de memória, risco de swap

**DayZ específico**:
- Servidor DayZ consome 4-12GB dependendo de:
  - Quantidade de jogadores
  - Objetos no mapa (construções, veículos, itens)
  - Mods instalados
  - Tempo de uptime (vazamento gradual de memória)

#### **2.3.2 Uso de Swap**
```bash
SWAP_TOTAL_MB=$(awk '/SwapTotal/ {printf "%.0f", $2/1024}' /proc/meminfo)
SWAP_FREE_MB=$(awk '/SwapFree/ {printf "%.0f", $2/1024}' /proc/meminfo)
SWAP_USED=$((SWAP_TOTAL_MB - SWAP_FREE_MB))
```

- **O que é**: Memória em disco usada quando RAM acaba
- **⚠️ Alerta**: Swap > 256MB em uso
- **Impacto no DayZ**: Swap causa **stutter severo** porque:
  - Acesso a disco é 1000x+ mais lento que RAM
  - Quando o servidor acessa dados em swap, há congelamento perceptível
  - Veículos e jogadores experienciam lag spikes

**Recomendação**: Servidor DayZ **NUNCA** deveria usar swap em produção.

---

### 2.4 Métricas do Processo DayZServer (via ps)

#### **2.4.1 Detecção do PID**
O script detecta o PID automaticamente em ordem de preferência:

1. **Via systemd** (preferencial):
```bash
systemctl show dayz-server -p MainPID --value
```

2. **Via ps + regex** (fallback):
```bash
ps -eo pid,etimes,cmd | grep -E "DayZServer|DayZServer_x64"
```

#### **2.4.2 Resident Set Size (RSS)**
```bash
RSS_KB=$(ps -p "$PID" -o rss=)
DAYZ_RSS_MB=$(awk -v kb="$RSS_KB" 'BEGIN{printf "%.0f", kb/1024}')
```

- **O que é**: Memória **física** (RAM) realmente ocupada pelo processo
- **Valores típicos**:
  - **Servidor novo**: 4-6GB
  - **Servidor com 10-30 players**: 6-10GB
  - **Servidor com muitas bases/veículos**: 10-14GB
  - **> 15GB**: Provável vazamento de memória, considere restart

#### **2.4.3 Elapsed Time (ETIME)**
```bash
ETIME=$(ps -p "$PID" -o etime=)
```
- **O que é**: Tempo que o processo está rodando (formato: dias-hh:mm:ss)
- **Correlação**: Uptime alto + RSS crescente = vazamento de memória

---

### 2.5 Métricas Avançadas do Processo (via pidstat) ⭐

```bash
pidstat -p "$PID" -u -r -d 1 "$SECONDS_TO_SAMPLE"
```

O `pidstat` coleta 3 blocos separados de dados:

#### **2.5.1 Bloco CPU (-u)**
```
Average: UID PID %usr %system %guest %wait %CPU CPU Command
```

- **%usr**: % de tempo do processo em user space (lógica do jogo)
- **%system**: % de tempo do processo em kernel space (syscalls)
- **%CPU**: Uso total de CPU do processo (pode ser > 100% se multithread, mas DayZ geralmente fica 100-150%)
- **CPU**: Core específico onde o processo está rodando

**Interpretação DayZ**:
- **%usr alto (70-90%)**: Normal, servidor processando jogo
- **%system alto (>20%)**: Muito I/O ou syscalls, investigar
- **%CPU flutuando muito**: Pode indicar steal time ou contenção

#### **2.5.2 Bloco Memória (-r)**
```
Average: UID PID minflt/s majflt/s VSZ RSS %MEM Command
```

- **minflt/s**: Page faults menores/s (página estava em cache)
- **majflt/s**: Page faults maiores/s (teve que buscar do disco) ⚠️
- **VSZ**: Virtual memory size (inclui shared libs, não é crítico)
- **RSS**: Resident Set Size (RAM real usada)
- **%MEM**: Percentual da RAM total do sistema

**⚠️ CRÍTICO**: Se `majflt/s > 0`, o processo está acessando swap → lag severo

#### **2.5.3 Bloco I/O (-d)**
```
Average: UID PID kB_rd/s kB_wr/s kB_ccwr/s iodelay Command
```

- **kB_rd/s**: Taxa de leitura de disco (KB/s)
- **kB_wr/s**: Taxa de escrita de disco (KB/s) - **Importante para persistência**
- **kB_ccwr/s**: Escrita cancelada (cache)
- **iodelay**: Ticks de clock esperando I/O

**DayZ específico**:
- **kB_wr/s contínuo**: Logs e auto-save de persistência
- **Picos altos de kB_wr/s**: Save completo do mundo (construções, veículos, stashes)
- **iodelay alto**: Disco lento, pode causar stutter durante saves

---

### 2.6 Métricas de Sistema (via vmstat)

```bash
vmstat 1 "$SECONDS_TO_SAMPLE"
```

#### **2.6.1 Run Queue (r)** ⭐ Indicador de Contenção
```bash
VM_R=$(tail -n1 "$VMSTAT_OUT" | awk '{print $1}')
```

- **O que é**: Número de processos **prontos para executar** mas aguardando CPU
- **Interpretação**:
  - **r < CPU_COUNT**: OK, não há contenção
  - **r >= CPU_COUNT**: CPU saturada, processos competindo por tempo
  - **r > CPU_COUNT * 2**: Contenção severa

**Exemplo**: VPS com 4 cores
- `r = 2`: OK (2 processos aguardando em 4 cores disponíveis)
- `r = 5`: Atenção (5 processos competindo por 4 cores)
- `r = 10`: Crítico (fila de espera grande)

**DayZ específico**: Se `r` é alto E há steal time, outros processos na VPS estão competindo com DayZ.

---

### 2.7 Métricas de Rede

```bash
read_net_bytes() {
  rx=$(cat "/sys/class/net/$iface/statistics/rx_bytes")
  tx=$(cat "/sys/class/net/$iface/statistics/tx_bytes")
  echo "$rx $tx"
}
```

#### **2.7.1 Throughput RX/TX**
- **RX (receive)**: Dados recebidos (kbps)
- **TX (transmit)**: Dados enviados (kbps)

**DayZ específico**:
- **10-30 players**: ~500-2000 kbps TX (servidor → jogadores)
- **Picos**: Quando muitos jogadores entram simultaneamente
- **TX >> RX**: Normal, servidor envia mais dados (posições, eventos) do que recebe

**Limitações VPS**: Alguns planos limitam bandwidth; se atingir o cap, jogadores experienciam lag de rede.

---

## 3. Sistema de Scoring e Diagnóstico

### 3.1 Algoritmo de Pontuação

O script atribui pontos baseado em thresholds:

```bash
score=0

# Steal Time (PESO ALTO)
if steal < 1.0: score += 2
elif steal < 3.0: score += 1
else: score -= 2

# I/O Wait
if iowait < 2.0: score += 1
elif iowait >= 5.0: score -= 1

# Core mais quente
if hot_load < 70.0: score += 1
elif hot_load >= 90.0 AND (VM_R > 1 OR steal >= 1.0): score -= 1

# Memória disponível
if mem_avail < 800MB: score -= 1
else: score += 1

# Swap
if swap_used > 256MB: score -= 1

# Run queue
if VM_R >= CPU_COUNT: score -= 1
```

### 3.2 Veredito Final

| Score | Veredito | Interpretação |
|-------|----------|---------------|
| ≥ 4   | **OK (estável)** | VPS saudável, sem problemas aparentes |
| 2-3   | **Bom, mas pode oscilar** | Servidor ok, mas pode ter problemas em horário de pico |
| < 2   | **⚠️ Atenção (instabilidade provável)** | VPS com problemas, espere teleporte/lag |

---

## 4. Interpretação Prática: Cenários Comuns

### 4.1 Cenário: VPS Compartilhada Sobrecarregada
```
CPU all: usr=35.2% sys=8.1% iowait=1.2% steal=8.5% idle=47.0%
Core mais quente: CPU 2 | usr=82.3% sys=11.2% steal=9.1% idle=0%
Run queue: 6
```

**Diagnóstico**: 
- ⚠️ **Steal time de 8.5%** é ALTO
- Core do DayZ (CPU 2) está trabalhando muito mas sendo interrompido
- Run queue = 6 indica contenção

**Causa**: Outros VMs no host físico estão consumindo CPU

**Sintomas esperados**:
- Teleporte de veículos
- Desync de jogadores
- Frame drops no servidor

**Solução**:
- Migrar para VPS dedicada ou plano com CPU garantido
- Reduzir carga do servidor (menos veículos, limitFPS)

---

### 4.2 Cenário: Disco Lento
```
CPU all: usr=25.0% sys=6.0% iowait=12.5% steal=0.5% idle=56.0%
DayZ IO: kB_wr/s=15000 (logs/persistência)
```

**Diagnóstico**:
- ⚠️ **I/O wait de 12.5%** é ALTO
- Servidor escrevendo muito (15MB/s)
- Steal baixo descarta problema de contenção

**Causa**: Disco lento ou IOPS limitado

**Sintomas esperados**:
- Travamentos ao salvar persistência
- Delay ao spawnar loot
- Logs atrasados

**Solução**:
- Migrar para VPS com SSD/NVMe
- Reduzir frequência de auto-save
- Mover logs para ramdisk (/tmp)

---

### 4.3 Cenário: Vazamento de Memória
```
DayZ memória: 14500MB
ETIME: 3-12:45:30 (3 dias de uptime)
Memória disponível: 650MB
Swap em uso: 890MB
```

**Diagnóstico**:
- ⚠️ **RSS de 14.5GB** é alto para servidor DayZ
- ⚠️ **Swap de 890MB** indica pressão de memória
- Uptime de 3 dias correlaciona com crescimento

**Causa**: Vazamento gradual de memória (bug conhecido do DayZ)

**Sintomas esperados**:
- Stutter/stuttering
- Lag spikes aleatórios
- Crash eventual por OOM (Out of Memory)

**Solução**:
- Restart do servidor a cada 24-48h (cron job)
- Monitorar RSS ao longo do dia
- Avaliar remover mods problemáticos

---

### 4.4 Cenário: Core Único Saturado (Limite da Engine)
```
Core mais quente: CPU 1 | usr=94.1% sys=5.2% steal=0.3% idle=0.4%
CPU all: usr=25.0% sys=2.0% steal=0.3% idle=72.7%
Run queue: 1
DayZ (pidstat): %CPU=99.5
```

**Diagnóstico**:
- ✅ Steal time baixo (VPS ok)
- ⚠️ **Um core a 99%** enquanto outros estão ociosos
- CPU média baixa porque outros cores não são usados

**Causa**: DayZ atingiu limite da engine single-threaded

**Sintomas esperados**:
- FPS do servidor cai (visível no #monitor Discord)
- Não é culpa da VPS, é limite do próprio jogo

**Solução**:
- Reduzir carga do servidor:
  - `-limitFPS=100-120` (ao invés de ilimitado)
  - `-cpuCount=2` (força uso de 2 cores para threads auxiliares)
  - Menos AI (zombies, animais)
  - Menos veículos simultâneos
  - Menos objetos dinâmicos (loot complexity)

---

## 5. Métricas Prioritárias por Ordem de Impacto

### Para servidor DayZ em VPS compartilhada:

1. **🥇 CPU Steal Time** - Indicador #1 de problema em VPS
2. **🥈 Core Mais Quente (load %)** - Mostra se single-thread está saturado
3. **🥉 I/O Wait** - Afeta persistência e spawns
4. **4️⃣ Memória Disponível** - Previne swap
5. **5️⃣ Swap em Uso** - Causa lag severo se > 0
6. **6️⃣ Run Queue** - Indica contenção geral
7. **7️⃣ DayZ RSS** - Identifica vazamento de memória
8. **8️⃣ DayZ kB_wr/s** - Monitora I/O de persistência

---

## 6. Recomendações de Uso

### 6.1 Execução via Cron
```bash
# Rodar a cada 15 minutos
*/15 * * * * /path/to/dayz-perf-check.sh --seconds 5 --iface eth0 >> /var/log/dayz-perf.log 2>&1
```

### 6.2 Análise Pós-Queixas de Jogadores
```bash
# Coleta mais longa para análise detalhada
sudo ./dayz-perf-check.sh --seconds 30 --iface eth0
```

### 6.3 Comparação Horário de Pico vs. Fora de Pico
```bash
# Durante a manhã (baixa ocupação VPS)
./dayz-perf-check.sh > /tmp/perf-morning.txt

# Durante a noite (alta ocupação VPS)
./dayz-perf-check.sh > /tmp/perf-night.txt

# Comparar steal time nos dois períodos
```

---

## 7. Limites Aceitáveis para Servidor Profissional

| Métrica | Ótimo | Aceitável | Problemático |
|---------|-------|-----------|--------------|
| **CPU Steal** | < 1% | 1-3% | > 3% |
| **I/O Wait** | < 2% | 2-5% | > 5% |
| **Core Load** | < 70% | 70-90% | > 90% |
| **Mem Disponível** | > 2GB | 800MB-2GB | < 800MB |
| **Swap Usado** | 0 MB | < 100MB | > 256MB |
| **Run Queue** | < cores | < cores*1.5 | > cores*2 |
| **DayZ RSS** | 4-8GB | 8-12GB | > 12GB |

---

## 8. Conclusão

Este script foi desenhado especificamente para identificar o **gargalo crítico** de servidores DayZ em **VPS compartilhadas**: o **CPU steal time**. 

Como o DayZ é single-threaded e processa física em tempo real, qualquer interrupção causada pelo hypervisor (steal) resulta em cálculos incorretos de posição, causando os problemas de teleporte de veículos que você identificou.

As outras métricas (I/O, memória, swap) são importantes, mas **steal time é o vilão principal** neste cenário específico.

### Próximos Passos Recomendados:

1. **Executar o script em horários diferentes** para correlacionar steal time com horários de pico da VPS
2. **Se steal > 3% consistentemente**: Considerar migração para VPS com CPU dedicado/garantido
3. **Se steal < 1%**: Problema não é a VPS, investigar configuração do servidor DayZ
4. **Monitorar RSS ao longo dos dias**: Identificar necessidade de restart periódico

---

**Autor**: Script criado para diagnóstico de performance do servidor DayZ - Beco Gaming  
**Data**: Dezembro 2025  
**Versão**: 1.0

