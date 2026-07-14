import pandas as pd
import json
import os
from datetime import datetime

# --- 1. Konfiguration ---
filtered_dir = './gtfs_filtered/'
output_file = './trips.geojson' 
target_date_str = '20260619'  # HIER IHR GÜLTIGES DATUM EINTRAGEN (Format: YYYYMMDD)

print(f"Starte Verarbeitung für das Datum: {target_date_str}...")

# --- 2. Datums-Filterung (Der fehlende Block) ---
target_date = datetime.strptime(target_date_str, '%Y%m%d')
days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
target_weekday = days[target_date.weekday()]

active_services = set()

# A) Regulären Kalender prüfen
if os.path.exists(f'{filtered_dir}calendar.txt'):
    cal = pd.read_csv(f'{filtered_dir}calendar.txt', dtype=str)
    cal['start_date'] = pd.to_numeric(cal['start_date'])
    cal['end_date'] = pd.to_numeric(cal['end_date'])
    target_date_num = int(target_date_str)

    valid_cal = cal[
        (cal['start_date'] <= target_date_num) &
        (cal['end_date'] >= target_date_num) &
        (cal[target_weekday] == '1')
    ]
    active_services.update(valid_cal['service_id'].tolist())

# B) Ausnahmedaten (Feiertage, Ausfälle) prüfen
if os.path.exists(f'{filtered_dir}calendar_dates.txt'):
    cal_dates = pd.read_csv(f'{filtered_dir}calendar_dates.txt', dtype=str)
    
    # Ausnahmen: Zusätzliche Fahrten
    added = cal_dates[(cal_dates['date'] == target_date_str) & (cal_dates['exception_type'] == '1')]
    active_services.update(added['service_id'].tolist())
    
    # Ausnahmen: Ausfallende Fahrten
    removed = cal_dates[(cal_dates['date'] == target_date_str) & (cal_dates['exception_type'] == '2')]
    active_services.difference_update(removed['service_id'].tolist())

print(f"Aktive Service-IDs für dieses Datum: {len(active_services)}")
if len(active_services) == 0:
    print("WARNUNG: Keine Fahrpläne für dieses Datum gefunden! Bitte Datum anpassen.")

# --- 3. Fahrten auf das Datum filtern ---
trips = pd.read_csv(f'{filtered_dir}trips.txt', dtype=str)
trips = trips[trips['service_id'].isin(active_services)]
valid_trip_ids = set(trips['trip_id'].tolist())
print(f"Gültige Einzelfahrten heute: {len(valid_trip_ids)}")

# --- 4. Haltestellen & Zeiten laden (nur für gültige Fahrten) ---
stop_times = pd.read_csv(f'{filtered_dir}stop_times.txt', dtype=str)
stop_times = stop_times[stop_times['trip_id'].isin(valid_trip_ids)]
stops = pd.read_csv(f'{filtered_dir}stops.txt', dtype=str)

stop_times['stop_sequence'] = pd.to_numeric(stop_times['stop_sequence'])
stops['stop_lat'] = pd.to_numeric(stops['stop_lat'])
stops['stop_lon'] = pd.to_numeric(stops['stop_lon'])

def time_to_minutes(time_str):
    try:
        parts = str(time_str).strip().split(':')
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return None

print("Verknüpfe Haltestellen mit Fahrzeiten...")
merged = pd.merge(stop_times, stops, on='stop_id', how='inner')
merged = merged.sort_values(by=['trip_id', 'stop_sequence'])

grouped = merged.groupby('trip_id')
features = []

print("Generiere zeitbasierte Pfade für die Animation...")

# --- 5. GeoJSON-Struktur für MapLibre-Interpolation bauen ---
for trip_id, group in grouped:
    coords = []
    times = []
    
    for _, row in group.iterrows():
        minute = time_to_minutes(row['departure_time'])
        if minute is not None:
            coords.append([row['stop_lon'], row['stop_lat']])
            times.append(minute) # Den Zeit-Array für JavaScript füttern
            
    if len(coords) < 2:
        continue
        
    features.append({
        "type": "Feature",
        "properties": {
            "trip_id": trip_id,
            "start_time": times[0],
            "end_time": times[-1],
            "times": times
        },
        "geometry": {
            "type": "LineString",
            "coordinates": coords
        }
    })

geojson_data = {
    "type": "FeatureCollection",
    "features": features
}

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(geojson_data, f, ensure_ascii=False, indent=2)

print(f"Erfolgreich! {len(features)} animierbare Fahrten in {output_file} exportiert.")