"""Import the original KML/KMZ without inferring operators from station IDs.

Usage: python scripts/import_kml.py path/to/stations.kml [path/to/database.sqlite]
Run the server once first to initialize its database schema.
"""
import sys
import re
import json
import sqlite3
import hashlib
import zipfile
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone

source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('data/source-stations.kml')
database = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('data/btmap.sqlite')
ns = '{http://www.opengis.net/kml/2.2}'
colors = {'Orange': '#ed761a', 'T-Mobile': '#dc287b', 'Play': '#7956ce', 'Plus': '#25a664'}
aliases = {'P4': 'Play', 'Polkomtel': 'Plus', 'T-Mobile Polska': 'T-Mobile', 'Orange Polska': 'Orange'}
stations = {}
folder_stack = []
now = datetime.now(timezone.utc).isoformat()
archive = zipfile.ZipFile(source) if source.suffix.lower() == '.kmz' else None
stream = archive.open(next(n for n in archive.namelist() if n.endswith('.kml'))) if archive else source.open('rb')
element_stack = []
for event, element in ET.iterparse(stream, events=('start', 'end')):
    tag = element.tag.removeprefix(ns)
    if event == 'start':
        element_stack.append(tag)
        if tag == 'Folder':
            folder_stack.append('')
        continue
    if tag == 'name' and len(element_stack) > 1 and element_stack[-2] == 'Folder':
        folder_stack[-1] = element.text or ''
    if tag == 'Placemark':
        coords = element.find(f'{ns}Point/{ns}coordinates')
        if coords is not None and coords.text:
            lng, lat = map(float, coords.text.strip().split(',')[:2])
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                desc = element.findtext(f'{ns}description', '')
                station_id = element.findtext(f'{ns}name', '').strip()
                def field(name):
                    match = re.search(r'<b>' + name + r':</b>\s*(.*?)(?:<br|$)', desc, re.S)
                    return match.group(1).strip() if match else ''
                operator = aliases.get(folder_stack[-1], folder_stack[-1]) if folder_stack else 'Nieznany'
                key = f'{lat:.6f},{lng:.6f}|{operator}|{station_id}'
                if key not in stations:
                    stations[key] = {'id': 'UKE_' + hashlib.sha256(key.encode()).hexdigest()[:18], 'lat': lat, 'lng': lng, 'address': ', '.join(x for x in [field('City'), field('Address')] if x), 'province': field('Region'), 'stationId': station_id, 'operators': []}
                row = stations[key]
                op = next((o for o in row['operators'] if o['name'] == operator), None)
                if not op:
                    op = {'name': operator, 'color': colors.get(operator, '#71808a'), 'stationIds': [], 'bands': []}
                    row['operators'].append(op)
                if station_id not in op['stationIds']:
                    op['stationIds'].append(station_id)
                for raw in field('Bands').split(','):
                    match = re.match(r'\s*([A-Za-z0-9]+)\s+(\d+)', raw)
                    if not match:
                        continue
                    tech, band = match.groups()
                    tech = '5G' if tech == 'NR' else tech
                    permit = re.search(re.escape(raw.strip()) + r':\s*([^<]+)', desc)
                    entry = {'tech': tech, 'band': band, 'status': 'Pozwolenie', 'permit': permit.group(1).strip() if permit else ''}
                    if not any(b['tech'] == tech and b['band'] == band and b['permit'] == entry['permit'] for b in op['bands']):
                        op['bands'].append(entry)
        element.clear()
    elif tag == 'Folder':
        folder_stack.pop()
        element.clear()
    element_stack.pop()
stream.close()
if archive:
    archive.close()

coord_groups = {}
for row in stations.values():
    ck = f"{row['lat']:.6f},{row['lng']:.6f}"
    coord_groups.setdefault(ck, []).append(row)
for group in coord_groups.values():
    if len(group) > 1:
        base_lat, base_lng = group[0]['lat'], group[0]['lng']
        for idx, row in enumerate(group):
            if idx == 0:
                continue
            angle = (idx * 2 * math.pi) / len(group)
            row['lat'] = round(base_lat + math.cos(angle) * 0.000055, 6)
            row['lng'] = round(base_lng + math.sin(angle) * 0.000085, 6)

db = sqlite3.connect(database)
with db:
    for row in stations.values():
        db.execute('''INSERT INTO towers(id, stationId, address, province, lat, lng, operators, source, addedBy, status, createdAt)
          VALUES(?,?,?,?,?,?,?,'UKE','Import KML','APPROVED',?)
          ON CONFLICT(id) DO UPDATE SET stationId=excluded.stationId,address=excluded.address,province=excluded.province,operators=excluded.operators''',
          (row['id'], row['stationId'], row['address'], row['province'], row['lat'], row['lng'], json.dumps(row['operators'], ensure_ascii=False), now))
    for key, value in {'sourceFile': source.name, 'importedAt': now, 'sourceDescription': 'Lokalny plik KML z pozwoleniami UKE; data aktualności zbioru nie została potwierdzona.'}.items():
        db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', (key, value))
print(f'Imported {len(stations)} locations from {source.name}.')
print(json.dumps(dict(db.execute("SELECT source,COUNT(*) FROM towers GROUP BY source").fetchall())))
db.close()
