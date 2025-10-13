#!/bin/bash

DBFILE_PATH=/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/storage_1/players.db
WORKING_PATH=/tmp/dayz

if [ ! -e $DBFILE_PATH ]
then
        echo "DBFILE_PATH does not exist. Check file path: $DBFILE_PATH"
        exit 1
fi

PLAYER_UID=$1
POSITION_X=$2
POSITION_Z=$3
POSITION_Y=$4

function usage() {
        echo "Usage: $0 PLAYERID XXXXXXXX ZZZZZZZZ YYYYYYYY" && echo ""
        echo "Player ID example: AbcDefGhiJ-1_-A7b8C1Def04G4hi1JKLMn2OpqRStu="
        echo "X coordenate example (Chernarus): 10333.76"
        echo "Z coordenate example (Chernarus): 129.958527"
        echo "Y coordenate example (Chernarus): 10131.459"
        exit 1
}
if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
        usage
fi

POSITION_X=$(printf "%08X" "$(python3 -c "import struct; print(int.from_bytes(struct.pack('!f', $POSITION_X), 'big'))")" | tac -rs .. | echo "$(tr -d '\n')")
POSITION_Z=$(printf "%08X" "$(python3 -c "import struct; print(int.from_bytes(struct.pack('!f', $POSITION_Z), 'big'))")" | tac -rs .. | echo "$(tr -d '\n')")
POSITION_Y=$(printf "%08X" "$(python3 -c "import struct; print(int.from_bytes(struct.pack('!f', $POSITION_Y), 'big'))")" | tac -rs .. | echo "$(tr -d '\n')")

if [ "$#" -ne 4 ]; then
        echo "Incorret parameters!"
        usage
elif [ ${#PLAYER_UID} -lt 1 ]; then
        echo "PLAYER_UID parameter is required"
        usage
elif [ ${#POSITION_X} != 8 ]; then
        echo "X coordinate bytes must be 8 characters long"
        usage
elif [ ${#POSITION_Z} != 8 ]; then
        echo "Z coordinate bytes must be 8 characters long"
        usage
elif [ ${#POSITION_Y} != 8 ]; then
        echo "Y coordinate bytes must be 8 characters long"
        usage
else

# To upper
POSITION_X=$(echo $POSITION_X | tr 'a-z' 'A-Z')
POSITION_Z=$(echo $POSITION_Z | tr 'a-z' 'A-Z')
POSITION_Y=$(echo $POSITION_Y | tr 'a-z' 'A-Z')

WORKING_PATH=$WORKING_PATH/$PLAYER_UID
mkdir -p $WORKING_PATH

cp -Rap $DBFILE_PATH $WORKING_PATH/players_bkp.db

FILE_SQL=$WORKING_PATH/update.sql
FILE_SQL_BKP=$WORKING_PATH/update_bkp.sql
FILE_PLAYER_OLD=$WORKING_PATH/player_prev.txt
FILE_PLAYER_NEW=$WORKING_PATH/player_new.txt

cd $DB_PATH
# Extract player data
sqlite3 $DBFILE_PATH "SELECT hex(Data) FROM Players where UID = '$PLAYER_UID';" > $FILE_PLAYER_OLD
if [ ! -s $FILE_PLAYER_OLD ]; then
        echo "Player not found" && exit 1
fi

cp $FILE_PLAYER_OLD $FILE_PLAYER_NEW

player_prev=$(<$FILE_PLAYER_OLD)

# Check db version
db_version="${player_prev:0:4}"
if [ $db_version != "0200" ]; then
        echo "DB version is not compatible. Accepted version: 0200" && exit 1
fi

length=${#player_prev}

# Replace coordenates X,Y and Z
for ((i = 0; i < length; i++)); do
    char_from="${player_prev:i:1}"

    if [ "$i" -gt 3 -a "$i" -lt 12 ]; then
       char_to="${POSITION_X:i-4:1}"
       pos=$((i + 1))
       #echo "Position X - Replace $char_from => $char_to in position $pos"
       sed -i s/./$char_to/$pos $FILE_PLAYER_NEW
    elif [ "$i" -gt 11 -a "$i" -lt 20 ]; then
       char_to="${POSITION_Z:i-12:1}"
       pos=$((i + 1))
       #echo "Position Z - Replace $char_from => $char_to in position $pos"
       sed -i s/./$char_to/$pos $FILE_PLAYER_NEW
    elif [ "$i" -gt 19 -a "$i" -lt 28 ]; then
       char_to="${POSITION_Y:i-20:1}"
       pos=$((i + 1))
       #echo "Position Y - Replace $char_from => $char_to in position $pos"
       sed -i s/./$char_to/$pos $FILE_PLAYER_NEW
    fi

    if [ "$i" == 28 ]; then
       break
    fi
done

# Create SQL script backup with the update
echo "UPDATE Players set Data = X'" > $FILE_SQL_BKP
cat $FILE_PLAYER_OLD  >> $FILE_SQL_BKP
echo "' WHERE UID = '$PLAYER_UID';" >> $FILE_SQL_BKP

# Create SQL script with the update
echo "UPDATE Players set Data = X'" > $FILE_SQL
cat $FILE_PLAYER_NEW  >> $FILE_SQL
echo "' WHERE UID = '$PLAYER_UID';" >> $FILE_SQL

# GNU sed to delete newlines
sed -i ':a;N;$!ba;s/\n//g' $FILE_SQL
sed -i ':a;N;$!ba;s/\n//g' $FILE_SQL_BKP

# Set player alive
echo "UPDATE Players set Alive = 1 where UID = '$PLAYER_UID';" >> $FILE_SQL_BKP

# Show the difference
#diff $FILE_PLAYER_OLD $FILE_PLAYER_NEW --color

rm $FILE_PLAYER_OLD
rm $FILE_PLAYER_NEW

cd $WORKING_PATH
echo ""
pwd
ls -lh
echo ""

#echo "To update execute: sqlite3 $DBFILE_PATH < $FILE_SQL"
sqlite3 $DBFILE_PATH < $FILE_SQL

echo "To execute a rollback: sqlite3 $DBFILE_PATH < $FILE_SQL_BKP"

fi