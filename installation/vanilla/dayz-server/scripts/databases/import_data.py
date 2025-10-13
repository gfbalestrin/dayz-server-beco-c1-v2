import sqlite3
import csv
from datetime import datetime

conn = sqlite3.connect('players_beco_c1.db')
cursor = conn.cursor()
with open('players_beco_c1.sql', 'r', encoding='utf-8') as f:
    sql_script = f.read()
cursor.executescript(sql_script)
conn.commit()
conn.close()

conn = sqlite3.connect('server_beco_c1_logs.db')
cursor = conn.cursor()
with open('server_beco_c1_logs.sql', 'r', encoding='utf-8') as f:
    sql_script = f.read()
cursor.executescript(sql_script)
conn.commit()
conn.close()