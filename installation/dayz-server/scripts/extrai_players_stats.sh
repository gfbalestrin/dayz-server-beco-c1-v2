#!/bin/bash
DB_FILENAME=/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/storage_1/players.db

#PLAYERSTATS="/home/fastadmin/servers/dayz-server/scripts/extrator_playersdb/players_stats.csv"
PLAYERSTATS="/home/dayzadmin/servers/dayz-server/scripts/databases/players_stats.csv"
echo "PlayerID;Longest_survivor_hit;Players_killed;Infected_killed;Playtime" > $PLAYERSTATS

function InsertDataFile() {
        echo "$1;$2;$3;$4;$5" >> $PLAYERSTATS
}

sqlite3 $DB_FILENAME "SELECT UID FROM Players WHERE Alive = 1;" | while read player_id; do

player=$(sqlite3 $DB_FILENAME "SELECT hex(Data) FROM Players WHERE UID = '$player_id';")
length=${#player}

longest_survivor_hit=""
players_killed=""
infected_killed=""
playtime=""

function CheckDataColect() {
        if [ $ascii == "infected_killed" ]; then
                infected_killed=$float
        fi
        if [ $ascii == "players_killed" ]; then
                players_killed=$float
        fi
        if [ $ascii == "longest_survivor_hit" ]; then
                longest_survivor_hit=$float
        fi
        if [ $ascii == "playtime" ]; then
                playtime=$float
        fi
        if [ "$longest_survivor_hit" != "" ] && [ "$players_killed" != "" ] && [ "$infected_killed" != "" ] && [ "$playtime" != "" ]; then
                InsertDataFile $player_id $longest_survivor_hit $players_killed $infected_killed $playtime
                return 1
        fi
	return 0
}


echo "Extraindo dados de PlayerID $player_id ..."

bytes_dbversion=${player:0:4}
hex_position_x=${player:4:8}
float=$(echo $hex_position_x | xxd -r -p | od -An -t fF | tr -d ' ')
float_position_x=$float
hex_position_z=${player:12:8}
float=$(echo $hex_position_z | xxd -r -p | od -An -t fF | tr -d ' ')
hex_position_y=${player:20:8}
float=$(echo $hex_position_y | xxd -r -p | od -An -t fF | tr -d ' ')
float_position_y=$float

if [ -z "${float_position_x}" ]; then
#	echo "Ignorando player pois nao foi possivel obter sua localizacao"
	continue;
fi

#echo "Localization: https://dayz.xam.nu/#location=""$float_position_x"";""$float_position_y"";5"

hex_yaw1=${player:28:2}
hex_yaw2=${player:30:2}
int=`printf "%d\n" "0x$hex_yaw2$hex_yaw1"`
yaw=`echo $int"/ 65535" | bc -l`
yaw=`echo $yaw"* 6.28318530718" | bc -l`
yaw=`echo $yaw"-3.14159265359" | bc -l`

hex=${player:32:2}
int=`printf "%d\n" "0x$hex"`
size=$(($int*2))
hex=${player:34:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "Survivor Model - $ascii"
#echo "Analisando campos dinamicos..."
#echo ""

pos=$((34+$size))
hex=${player:$pos:8}
#int=`printf "%d\n" 0x$(echo $hex | rev | sed -E 's/(.)(.)/\2\1/g')`

pos=$(($pos+8))
hex=${player:$pos:8}
#int=`printf "%d\n" 0x$(echo $hex | rev | sed -E 's/(.)(.)/\2\1/g')`

pos=$(($pos+8))
hex=${player:$pos:8}
#int=`printf "%d\n" 0x$(echo $hex | rev | sed -E 's/(.)(.)/\2\1/g')`

pos=$(($pos+8))
hex=${player:$pos:2}
int=`printf "%d\n" "0x$hex"`
pos=$(($pos+2))
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
pos=$(($pos+$size))
hex=${player:$pos:8}
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "0 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
	continue;
fi

pos=$(($pos+8))
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
pos=$(($pos+$size))
hex=${player:$pos:8}
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "1 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi

pos=$(($pos+8))
int=`printf "%d\n" 0x$(echo $hex | rev | sed -E 's/(.)(.)/\2\1/g')`
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "2 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Playtime
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes playtime - $hex - $int"
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "3 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

# infected_killed
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "4 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
	#echo "Ignorando pois bytes ultrapassam 100..."
	continue;
fi

# mdf_epinephrine_state
size=$(($int*2))
hex=${player:$pos:$size}

ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "5 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# mdf_antibiotics_stat
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "6 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
        #echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# mdf_common_cold_state
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "7 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
        #echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# mdf_heatbuffer_state
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "8 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# playtime
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "9 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# dist
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "10 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# mdf_fever_state
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "11 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# mdf_wetness_state
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "12 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# Quebra com id do MK r6VD82cNqyjjdTSAFxYqgShTBcDVRRRtSG_wvUKnhyM=
#continue;

# longest_survivor_hit
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "13 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# players_killed
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "14 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"

if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# mdf_mask_state
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "15 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi


# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"
if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# mdf_cholera_state
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
#echo "16 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi

# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"
if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# ?
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
echo "17 - $ascii - $hex - $float"

CheckDataColect
if [ $? -ne 0 ]; then
        continue;
fi

# Bytes ?
hex=${player:$pos:2}
pos=$(($pos+2))
int=`printf "%d\n" "0x$hex"`
#echo "Bytes ? - $hex - $int"
if [ $int -gt 100 ]; then
#        echo "Ignorando pois bytes ultrapassam 100..."
        continue;
fi

# ?
size=$(($int*2))
hex=${player:$pos:$size}
ascii=$(echo -n $hex | xxd -r -p)
#echo "$hex - $ascii"
pos=$(($pos+$size))
hex=${player:$pos:8}
pos=$(($pos+8))
float=$(echo $hex | xxd -r -p | od -An -t fF | tr -d ' ')
echo "18 - $ascii - $hex - $float"


done

/home/fastadmin/servers/dayz-server/scripts/extrator_playersdb/envia_stats_to_discord.sh

