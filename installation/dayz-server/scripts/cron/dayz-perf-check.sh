#!/usr/bin/env bash
# dayz-perf-check.sh
# Diagnóstico rápido de performance (host + DayZServer) com saída amigável.
# - Detecta PID automaticamente via systemd (MainPID)
# - Coleta em paralelo (mpstat/vmstat/pidstat) para não "dobrar" o tempo
# - Parse robusto do pidstat (usa o cabeçalho para identificar os 3 blocos)
#
# Uso:
#   sudo ./dayz-perf-check.sh
#   ./dayz-perf-check.sh --seconds 10 --iface eth0
#   ./dayz-perf-check.sh --pid 1234
#   ./dayz-perf-check.sh --service dayz-server
#
# Requisitos recomendados:
#   sudo apt install -y sysstat procps
#
set -euo pipefail

SECONDS_TO_SAMPLE=5
IFACE=""
PID=""
SERVICE_NAME="dayz-server"
PROC_NAME_REGEX="DayZServer|DayZServer_x64|DayZServer.*"  # fallback via ps

# ---------- Helpers ----------
bold() { printf "\033[1m%s\033[0m" "$*"; }
green() { printf "\033[32m%s\033[0m" "$*"; }
yellow() { printf "\033[33m%s\033[0m" "$*"; }
red() { printf "\033[31m%s\033[0m" "$*"; }
dim() { printf "\033[2m%s\033[0m" "$*"; }

have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<EOF
$(bold "dayz-perf-check.sh") - diagnóstico rápido de performance (foco DayZ)

Opções:
  --seconds N       Duração da amostragem (padrão: ${SECONDS_TO_SAMPLE})
  --iface IFACE     Interface de rede para medir tráfego (ex: eth0, ens3)
  --pid PID         PID do DayZServer (se não informar, detecta via systemd)
  --service NAME    Nome do serviço systemd (padrão: ${SERVICE_NAME})
  -h, --help        Ajuda

Exemplos:
  sudo ./dayz-perf-check.sh
  ./dayz-perf-check.sh --seconds 10 --iface eth0
  ./dayz-perf-check.sh --service dayz-server --seconds 8
EOF
}

# ---------- Args ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seconds) SECONDS_TO_SAMPLE="${2:-}"; shift 2 ;;
    --iface) IFACE="${2:-}"; shift 2 ;;
    --pid) PID="${2:-}"; shift 2 ;;
    --service) SERVICE_NAME="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconhecido: $1"; usage; exit 1 ;;
  esac
done

if ! [[ "$SECONDS_TO_SAMPLE" =~ ^[0-9]+$ ]] || [[ "$SECONDS_TO_SAMPLE" -lt 1 ]]; then
  echo "Valor inválido para --seconds"
  exit 1
fi

# ---------- Dependency checks ----------
MISSING=()
for bin in mpstat vmstat ps awk sed grep cut tr uname date hostname nproc; do
  have "$bin" || MISSING+=("$bin")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "$(red "Faltam comandos básicos:") ${MISSING[*]}"
  echo "Instale pacotes base (procps, util-linux, sysstat)."
  exit 1
fi

if ! have pidstat; then
  echo "$(yellow "Aviso:") pidstat não encontrado. (sudo apt install sysstat) — análise do processo ficará limitada."
fi

# ---------- Detect PID via systemd (preferencial) ----------
if [[ -z "${PID:-}" ]] && have systemctl; then
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    _pid="$(systemctl show "$SERVICE_NAME" -p MainPID --value || true)"
    if [[ -n "${_pid:-}" && "${_pid:-0}" != "0" ]]; then
      PID="$_pid"
    fi
  fi
fi

# ---------- Fallback PID via ps (se não achou via systemd) ----------
if [[ -z "${PID:-}" ]]; then
  PID=$(ps -eo pid,etimes,cmd --no-headers \
    | awk -v re="$PROC_NAME_REGEX" '$0 ~ re { print $1, $2 }' \
    | sort -k2,2nr \
    | head -n1 \
    | awk '{print $1}' || true)
fi

# ---------- Network iface auto-detect ----------
if [[ -z "$IFACE" ]]; then
  if have ip; then
    IFACE=$(ip route 2>/dev/null | awk '/default/ {print $5; exit}' || true)
  fi
fi

# ---------- System baseline ----------
HOST=$(hostname)
KERNEL=$(uname -r)
NOW=$(date)
CPU_COUNT=$(nproc)
UPTIME=$(awk '{printf "%.0f", $1}' /proc/uptime 2>/dev/null || echo 0)

# ---------- Snapshot helpers ----------
read_net_bytes() {
  local iface="$1"
  [[ -z "$iface" ]] && return 1
  [[ -r "/sys/class/net/$iface/statistics/rx_bytes" ]] || return 1
  local rx tx
  rx=$(cat "/sys/class/net/$iface/statistics/rx_bytes")
  tx=$(cat "/sys/class/net/$iface/statistics/tx_bytes")
  echo "$rx $tx"
}

# ---------- Sampling (PARALELO) ----------
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

MPSTAT_OUT="$TMPDIR/mpstat.txt"
VMSTAT_OUT="$TMPDIR/vmstat.txt"
PIDSTAT_OUT="$TMPDIR/pidstat.txt"

# Rede: antes
NET_BEFORE=""
NET_AFTER=""
if [[ -n "${IFACE:-}" ]]; then
  NET_BEFORE=$(read_net_bytes "$IFACE" || true)
fi

echo "Coletando métricas por ${SECONDS_TO_SAMPLE}s..." >&2

mpstat -P ALL 1 "$SECONDS_TO_SAMPLE" >"$MPSTAT_OUT" &
PID_MPSTAT=$!

vmstat 1 "$SECONDS_TO_SAMPLE" >"$VMSTAT_OUT" 2>/dev/null &
PID_VMSTAT=$!

PID_PIDSTAT=""
if [[ -n "${PID:-}" ]] && ps -p "$PID" >/dev/null 2>&1 && have pidstat; then
  pidstat -p "$PID" -u -r -d 1 "$SECONDS_TO_SAMPLE" >"$PIDSTAT_OUT" 2>/dev/null &
  PID_PIDSTAT=$!
fi

wait "$PID_MPSTAT" || true
wait "$PID_VMSTAT" || true
if [[ -n "${PID_PIDSTAT:-}" ]]; then
  wait "$PID_PIDSTAT" || true
fi

# Rede: depois
if [[ -n "${IFACE:-}" ]]; then
  NET_AFTER=$(read_net_bytes "$IFACE" || true)
fi

# ---------- Parse mpstat averages ----------
AVG_ALL_LINE=$(awk '/^Average: +all/ {print}' "$MPSTAT_OUT" | tail -n1 || true)
if [[ -z "$AVG_ALL_LINE" ]]; then
  echo "$(red "Erro:") não consegui ler 'Average: all' do mpstat."
  exit 1
fi

# Average: all %usr %nice %sys %iowait %irq %soft %steal %guest %gnice %idle
AVG_USR=$(echo "$AVG_ALL_LINE" | awk '{print $(NF-9)}')
AVG_SYS=$(echo "$AVG_ALL_LINE" | awk '{print $(NF-8)}')
AVG_IOWAIT=$(echo "$AVG_ALL_LINE" | awk '{print $(NF-7)}')
AVG_STEAL=$(echo "$AVG_ALL_LINE" | awk '{print $(NF-3)}')
AVG_IDLE=$(echo "$AVG_ALL_LINE" | awk '{print $(NF)}')

# Core mais quente (usr+sys)
HOT_CORE_LINE=$(awk '
  /^Average:/ && $2 ~ /^[0-9]+$/ {
    cpu=$2; usr=$(NF-9); sys=$(NF-8);
    load=usr+sys;
    if(load>max){max=load; line=$0}
  }
  END{print line}
' "$MPSTAT_OUT")

HOT_CPU=$(echo "$HOT_CORE_LINE" | awk '{print $2}')
HOT_USR=$(echo "$HOT_CORE_LINE" | awk '{print $(NF-9)}')
HOT_SYS=$(echo "$HOT_CORE_LINE" | awk '{print $(NF-8)}')
HOT_STEAL=$(echo "$HOT_CORE_LINE" | awk '{print $(NF-3)}')
HOT_IDLE=$(echo "$HOT_CORE_LINE" | awk '{print $(NF)}')

# ---------- vmstat quick parse ----------
VM_LAST=$(tail -n1 "$VMSTAT_OUT" 2>/dev/null || true)
VM_R=$(echo "$VM_LAST" | awk '{print $1}' 2>/dev/null || echo "")

# ---------- Mem info ----------
MEM_TOTAL_MB=$(awk '/MemTotal/ {printf "%.0f", $2/1024}' /proc/meminfo)
MEM_AVAIL_MB=$(awk '/MemAvailable/ {printf "%.0f", $2/1024}' /proc/meminfo)
SWAP_TOTAL_MB=$(awk '/SwapTotal/ {printf "%.0f", $2/1024}' /proc/meminfo)
SWAP_FREE_MB=$(awk '/SwapFree/ {printf "%.0f", $2/1024}' /proc/meminfo)

# ---------- DayZ process summary (ps) ----------
DAYZ_SUMMARY="não detectado (serviço '$SERVICE_NAME' inativo ou PID não encontrado)"
DAYZ_RSS_MB=""
if [[ -n "${PID:-}" ]] && ps -p "$PID" >/dev/null 2>&1; then
  CMDLINE=$(ps -p "$PID" -o cmd= | sed 's/[[:space:]]\+/ /g' | cut -c1-180)
  ETIME=$(ps -p "$PID" -o etime= | tr -d ' ')
  RSS_KB=$(ps -p "$PID" -o rss= | tr -d ' ')
  DAYZ_RSS_MB=$(awk -v kb="$RSS_KB" 'BEGIN{printf "%.0f", kb/1024}')
  DAYZ_SUMMARY="PID=$PID | up=$ETIME | RSS=${DAYZ_RSS_MB}MB | cmd: $CMDLINE"
fi

# ---------- pidstat avg (robusto p/ seu formato: 3 blocos Average) ----------
PIDSTAT_USR=""
PIDSTAT_SYS=""
PIDSTAT_CPU=""
PIDSTAT_CMD=""
PIDSTAT_RSS_MB=""
PIDSTAT_KB_WR=""

if [[ -s "$PIDSTAT_OUT" ]]; then
  # Extrai Average do bloco de CPU/MEM/IO com base no cabeçalho anterior
  PIDSTAT_PACK=$(awk '
    BEGIN { mode="" }
    /%usr/ && /%system/ && /%CPU/ && /Command/ { mode="cpu"; next }
    /minflt\/s/ && /majflt\/s/ && /VSZ/ && /RSS/ && /%MEM/ { mode="mem"; next }
    /kB_rd\/s/ && /kB_wr\/s/ && /iodelay/ { mode="io"; next }

    /^Average:/ && mode=="cpu" { cpu_line=$0 }
    /^Average:/ && mode=="mem" { mem_line=$0 }
    /^Average:/ && mode=="io"  { io_line=$0 }

    END {
      if (cpu_line) print "CPU|" cpu_line;
      if (mem_line) print "MEM|" mem_line;
      if (io_line)  print "IO|"  io_line;
    }
  ' "$PIDSTAT_OUT" || true)

  CPU_LINE=$(echo "$PIDSTAT_PACK" | awk -F'|' '$1=="CPU"{print $2}')
  if [[ -n "${CPU_LINE:-}" ]]; then
    # Average: UID PID %usr %system %guest %wait %CPU CPU Command
    PIDSTAT_USR=$(echo "$CPU_LINE" | awk '{print $4}')
    PIDSTAT_SYS=$(echo "$CPU_LINE" | awk '{print $5}')
    PIDSTAT_CPU=$(echo "$CPU_LINE" | awk '{print $8}')
    PIDSTAT_CMD=$(echo "$CPU_LINE" | awk '{print $NF}')
  fi

  MEM_LINE=$(echo "$PIDSTAT_PACK" | awk -F'|' '$1=="MEM"{print $2}')
  if [[ -n "${MEM_LINE:-}" ]]; then
    # Average: UID PID minflt/s majflt/s VSZ RSS %MEM Command
    _rss_kb=$(echo "$MEM_LINE" | awk '{print $7}')
    PIDSTAT_RSS_MB=$(awk -v kb="$_rss_kb" 'BEGIN{printf "%.0f", kb/1024}')
  fi

  IO_LINE=$(echo "$PIDSTAT_PACK" | awk -F'|' '$1=="IO"{print $2}')
  if [[ -n "${IO_LINE:-}" ]]; then
    # Average: UID PID kB_rd/s kB_wr/s kB_ccwr/s iodelay Command
    PIDSTAT_KB_WR=$(echo "$IO_LINE" | awk '{print $5}')
  fi
fi

# ---------- Net throughput calc ----------
NET_NOTE=""
if [[ -n "${NET_BEFORE:-}" && -n "${NET_AFTER:-}" ]]; then
  RX1=$(echo "$NET_BEFORE" | awk '{print $1}')
  TX1=$(echo "$NET_BEFORE" | awk '{print $2}')
  RX2=$(echo "$NET_AFTER"  | awk '{print $1}')
  TX2=$(echo "$NET_AFTER"  | awk '{print $2}')
  DRX=$((RX2 - RX1))
  DTX=$((TX2 - TX1))
  NET_RX_KBPS=$(awk -v b="$DRX" -v s="$SECONDS_TO_SAMPLE" 'BEGIN{printf "%.1f", (b*8)/(s*1000)}')
  NET_TX_KBPS=$(awk -v b="$DTX" -v s="$SECONDS_TO_SAMPLE" 'BEGIN{printf "%.1f", (b*8)/(s*1000)}')
  NET_NOTE="iface=$IFACE | RX=${NET_RX_KBPS} kbps | TX=${NET_TX_KBPS} kbps"
else
  NET_NOTE="(sem medição de rede — informe --iface)"
fi

# ---------- Scoring / verdict ----------
score=0
notes=()

steal=$(awk -v x="$AVG_STEAL" 'BEGIN{print x+0}')
if awk "BEGIN{exit !($steal < 1.0)}"; then
  score=$((score+2))
  notes+=("Steal time: $(green "${AVG_STEAL}%") (ótimo para VPS)")
elif awk "BEGIN{exit !($steal < 3.0)}"; then
  score=$((score+1))
  notes+=("Steal time: $(yellow "${AVG_STEAL}%") (atenção em horário de pico)")
else
  score=$((score-2))
  notes+=("Steal time: $(red "${AVG_STEAL}%") (pode causar teleporte/batidas em veículos)")
fi

iow=$(awk -v x="$AVG_IOWAIT" 'BEGIN{print x+0}')
if awk "BEGIN{exit !($iow < 2.0)}"; then
  score=$((score+1))
  notes+=("I/O wait: $(green "${AVG_IOWAIT}%") (sem pressão de disco)")
elif awk "BEGIN{exit !($iow < 5.0)}"; then
  notes+=("I/O wait: $(yellow "${AVG_IOWAIT}%") (pode afetar persistência/loot)")
else
  score=$((score-1))
  notes+=("I/O wait: $(red "${AVG_IOWAIT}%") (risco de travadas e save atrasado)")
fi

hot_load=$(awk -v u="$HOT_USR" -v s="$HOT_SYS" 'BEGIN{print (u+0)+(s+0)}')
if awk "BEGIN{exit !($hot_load < 70.0)}"; then
  score=$((score+1))
  notes+=("Core mais quente (CPU $HOT_CPU): load=$(green "$(printf "%.1f" "$hot_load")%") (saudável)")
elif awk "BEGIN{exit !($hot_load < 90.0)}"; then
  notes+=("Core mais quente (CPU $HOT_CPU): load=$(yellow "$(printf "%.1f" "$hot_load")%") (perto do limite)")
else
  # Só consideramos crítico se houver pressão real (fila ou steal)
  if [[ -n "${VM_R:-}" && "$VM_R" -gt 1 ]] || awk "BEGIN{exit !($steal >= 1.0)}"; then
    score=$((score-1))
    notes+=("Core mais quente (CPU $HOT_CPU): load=$(red "$(printf "%.1f" "$hot_load")%") (alto + pressão — pode gerar jitter)")
  else
    # Pico sem pressão -> aviso leve
    notes+=("Core mais quente (CPU $HOT_CPU): load=$(yellow "$(printf "%.1f" "$hot_load")%") (pico curto sem pressão aparente)")
  fi
fi

if [[ "$MEM_AVAIL_MB" -lt 800 ]]; then
  score=$((score-1))
  notes+=("Memória disponível: $(red "${MEM_AVAIL_MB}MB") (baixa)")
else
  score=$((score+1))
  notes+=("Memória disponível: $(green "${MEM_AVAIL_MB}MB")")
fi

if [[ "$SWAP_TOTAL_MB" -gt 0 ]]; then
  SWAP_USED=$((SWAP_TOTAL_MB - SWAP_FREE_MB))
  if [[ "$SWAP_USED" -gt 256 ]]; then
    score=$((score-1))
    notes+=("Swap em uso: $(red "${SWAP_USED}MB") (pode gerar stutter)")
  else
    notes+=("Swap em uso: $(green "${SWAP_USED}MB")")
  fi
else
  notes+=("Swap: $(dim "não configurado")")
fi

if [[ -n "${VM_R:-}" ]]; then
  if [[ "$VM_R" -ge "$CPU_COUNT" ]]; then
    score=$((score-1))
    notes+=("Run queue (vmstat r): $(yellow "$VM_R") (concorrência alta)")
  else
    notes+=("Run queue (vmstat r): $(green "$VM_R")")
  fi
fi

# pidstat insights (se disponível)
if [[ -n "${PIDSTAT_CPU:-}" ]]; then
  notes+=("DayZ (pidstat): %CPU=${PIDSTAT_CPU}  %usr=${PIDSTAT_USR}  %sys=${PIDSTAT_SYS}  cmd=${PIDSTAT_CMD:-N/A}")
fi
if [[ -n "${PIDSTAT_RSS_MB:-}" ]]; then
  if [[ "$PIDSTAT_RSS_MB" -gt 12000 ]]; then
    notes+=("DayZ memória: $(red "${PIDSTAT_RSS_MB}MB") (alta — monitore crescimento ao longo das horas)")
  else
    notes+=("DayZ memória: $(green "${PIDSTAT_RSS_MB}MB")")
  fi
fi
if [[ -n "${PIDSTAT_KB_WR:-}" ]]; then
  notes+=("DayZ IO: kB_wr/s=${PIDSTAT_KB_WR} (logs/persistência)")
fi

verdict=""
if [[ $score -ge 4 ]]; then
  verdict="$(green "OK (estável)")"
elif [[ $score -ge 2 ]]; then
  verdict="$(yellow "Bom, mas pode oscilar")"
else
  verdict="$(red "Atenção (instabilidade provável)")"
fi

# ---------- Output ----------
echo
echo "$(bold "DayZ Perf Check") — $NOW"
echo "Host: $HOST | Kernel: $KERNEL | CPUs: $CPU_COUNT | Uptime: ${UPTIME}s | Service: $SERVICE_NAME"
echo

echo "$(bold "Resumo do sistema (média ${SECONDS_TO_SAMPLE}s)")"
printf "  CPU all: usr=%s%% sys=%s%% iowait=%s%% steal=%s%% idle=%s%%\n" "$AVG_USR" "$AVG_SYS" "$AVG_IOWAIT" "$AVG_STEAL" "$AVG_IDLE"
printf "  Core mais quente: CPU %s | usr=%s%% sys=%s%% steal=%s%% idle=%s%%\n" "$HOT_CPU" "$HOT_USR" "$HOT_SYS" "$HOT_STEAL" "$HOT_IDLE"
echo "  Memória: total=${MEM_TOTAL_MB}MB | disponível=${MEM_AVAIL_MB}MB | swap=${SWAP_TOTAL_MB}MB (livre=${SWAP_FREE_MB}MB)"
echo "  Rede: $NET_NOTE"
echo

echo "$(bold "Processo DayZServer")"
echo "  $DAYZ_SUMMARY"
if [[ -n "${PIDSTAT_CPU:-}" ]]; then
  echo "  pidstat avg: %CPU=${PIDSTAT_CPU}  %usr=${PIDSTAT_USR}  %sys=${PIDSTAT_SYS}  RSS=${PIDSTAT_RSS_MB:-N/A}MB  kB_wr/s=${PIDSTAT_KB_WR:-N/A}  cmd=${PIDSTAT_CMD:-N/A}"
else
  echo "  $(dim "pidstat indisponível (instale sysstat) ou PID não encontrado")"
fi
echo

echo "$(bold "Diagnóstico (foco DayZ/veículos)")"
for n in "${notes[@]}"; do
  echo "  - $n"
done
echo
echo "$(bold "Veredito:") $verdict"
echo

echo "$(bold "Dicas rápidas")"
echo "  - VPS saudável normalmente tem steal < 1% (se >3%, veículos sofrem)."
echo "  - Estabilidade > FPS alto: -cpuCount=2 e -limitFPS=100–120 ajudam bastante."
echo "  - Queda pontual de FPS no #monitor pode ser ok se steal/jitter estiverem baixos."
echo "  - Se a memória do DayZ continuar subindo ao longo das horas, avalie restart periódico."
echo

