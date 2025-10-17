# Automatische Runtime-Daten Migration

## Übersicht

Die Runtime-Datenbank führt **automatisch** eine Migration durch, wenn sie zum ersten Mal erstellt wird. Dies importiert alle verfügbaren historischen Runtime-Daten aus den Log-Dateien.

## Wie funktioniert es?

### 1. Automatische Migration beim ersten Start

Wenn die `runtime_stats.db` **nicht existiert**:

- ✅ Datenbank wird erstellt
- ✅ Migration wird **automatisch** gestartet
- ✅ Alle Log-Dateien werden gescannt
- ✅ Runtime-Daten werden extrahiert und importiert
- ✅ Migration wird als "abgeschlossen" markiert

### 2. Bei bestehendem Backend

Wenn die Datenbank bereits existiert, aber noch keine Migration durchgeführt wurde:

- ✅ Migration-Check läuft beim Start
- ✅ Falls noch nicht migriert: Auto-Migration startet
- ✅ Migration läuft nur **einmal**

### 3. Manuelle Migration

Falls du die Migration manuell triggern möchtest:

**Via WebUI:**

- Gehe zu "Runtime History" in der Sidebar
- Klicke auf "Run Migration" Button (erscheint nur wenn nicht migriert)

**Via API:**

```bash
curl -X POST http://localhost:8000/api/runtime-history/migrate
```

**Via Python-Skript:**

```bash
cd webui/backend
python migrate_runtime_data.py
```

## Welche Daten werden importiert?

Die Migration scannt folgende Verzeichnisse:

### Aktuelle Logs:

- `Logs/Scriptlog.log` → Mode: "normal"
- `Logs/Testinglog.log` → Mode: "testing"
- `Logs/Manuallog.log` → Mode: "manual"

### Rotierte Logs (falls vorhanden):

- `RotatedLogs/*/Scriptlog.log`
- `RotatedLogs/*/Testinglog.log`
- `RotatedLogs/*/Manuallog.log`

Aus jedem Log wird extrahiert:

- ⏱️ Runtime (in Sekunden und formatiert)
- 🖼️ Total Images
- 📊 Posters, Seasons, Backgrounds, TitleCards
- ⚠️ Errors
- 📅 Timestamp (aus Log-Zeile)

## Migration-Status prüfen

### Via API:

```bash
curl http://localhost:8000/api/runtime-history/migration-status
```

**Response:**

```json
{
  "success": true,
  "is_migrated": true,
  "migration_info": {
    "logs_migrated": {
      "value": "true",
      "updated_at": "2025-10-17T12:34:56"
    },
    "migrated_entries": {
      "value": "45",
      "updated_at": "2025-10-17T12:34:56"
    }
  },
  "total_entries": 45
}
```

### Via WebUI:

- Dashboard: Zeigt Info-Banner wenn Migration verfügbar
- Runtime History: Zeigt Migrations-Status oben auf der Seite

## Migration verhindern

Falls du die automatische Migration **nicht** möchtest:

1. **Vor dem ersten Start:**

   - Erstelle eine leere `runtime_stats.db` manuell
   - Migration wird dann übersprungen

2. **Migration-Flag manuell setzen:**
   ```python
   import sqlite3
   conn = sqlite3.connect('database/runtime_stats.db')
   cursor = conn.cursor()
   cursor.execute('''
       INSERT INTO migration_info (key, value, updated_at)
       VALUES ('logs_migrated', 'true', datetime('now'))
   ''')
   conn.commit()
   conn.close()
   ```

## Logs

Migration-Aktivitäten werden geloggt in:

- `UILogs/BackendServer.log`
- `UILogs/FrontendUI.log` (wenn Backend läuft)

**Beispiel-Logs:**

```
2025-10-17 12:34:56 - INFO - ✨ Runtime database created at /path/to/runtime_stats.db
2025-10-17 12:34:56 - INFO - 🔄 Starting automatic runtime data migration from logs...
2025-10-17 12:34:57 - INFO - Checking rotated logs in /path/to/RotatedLogs
2025-10-17 12:34:58 - INFO - ✅ Auto-migration complete: 45 imported, 3 skipped
2025-10-17 12:34:58 - INFO - ✅ Migration marked as completed (45 entries)
```

## Häufige Fragen

### Wird die Migration mehrmals ausgeführt?

❌ Nein! Die Migration läuft nur **einmal**. Ein Flag in der `migration_info` Tabelle verhindert doppelte Ausführungen.

### Was passiert wenn ein Log-File leer ist?

⏭️ Es wird übersprungen (kein Fehler).

### Was passiert wenn keine Runtime-Daten gefunden werden?

⏭️ Log wird übersprungen, Migration wird trotzdem als "abgeschlossen" markiert.

### Kann ich die Migration zurücksetzen?

✅ Ja:

```sql
DELETE FROM migration_info WHERE key = 'logs_migrated';
```

Beim nächsten Backend-Start läuft die Migration erneut.

### Werden neue Runs nach der Migration automatisch gespeichert?

✅ Ja! Nach jedem Script-Run werden die Daten automatisch aus dem Log extrahiert und in die DB gespeichert.

## Performance

- Migration dauert typischerweise **< 5 Sekunden** für 50+ Log-Dateien
- Läuft asynchron beim Backend-Start
- Blockiert das Backend nicht

## Troubleshooting

### Migration läuft nicht

1. Prüfe Backend-Logs: `UILogs/BackendServer.log`
2. Prüfe ob `runtime_database.py` importiert werden konnte
3. Prüfe Dateiberechtigungen für `database/` Verzeichnis

### Doppelte Einträge

- Sollte nicht passieren (Migration läuft nur einmal)
- Falls doch: `DELETE FROM runtime_stats WHERE ...` oder DB löschen und neu starten

### Fehlende Einträge

- Prüfe ob Log-Dateien das richtige Format haben
- Prüfe Backend-Logs für Parsing-Fehler
- Teste Log-Parsing manuell: `python test_runtime_db.py`
