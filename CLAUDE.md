# Family Ops - Claude Memory

## Kända problem och lösningar

### Problem: Alla händelser försvinner/laddas om efter redigering (v6.0.6)

**Symptom:** När man redigerar en händelse blir sidan tom i flera sekunder medan alla ~1600 händelser laddas om från alla kalendrar.

**Orsak:** I `server/index.js` invaliderades hela cachen efter uppdatering:
```javascript
// DÅLIGT - tvingar full omladdning av alla kalendrar
cacheTimestamp = 0;
```

**Lösning:** Uppdatera endast den specifika händelsen i cachen istället för att invalidera hela cachen:
```javascript
// BRA - uppdatera endast ändrad händelse
const updatedEvent = events.find(e => e.uid === uid);
if (updatedEvent && cachedCalendarEvents.length > 0) {
    const cacheIndex = cachedCalendarEvents.findIndex(e => e.uid === uid);
    if (cacheIndex >= 0) {
        cachedCalendarEvents[cacheIndex] = { ...cachedCalendarEvents[cacheIndex], ...updatedEvent };
    } else {
        cachedCalendarEvents.push(updatedEvent);
    }
    saveCacheToDisk();
}
```

**Plats i kod:** `server/index.js` i `/api/update-event` endpoint (runt rad 3316-3335)

---

### Problem: Krasch vid redigering av händelser med undefined source (v6.0.6)

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'includes')` när man försöker redigera vissa händelser.

**Orsak:** Kod anropade `editEventData.source.includes()` utan att kontrollera om `source` var definierad.

**Lösning:**
1. Lägg till default för `source` i `openEditModal()`:
   ```javascript
   source: event.source || 'Familjen'
   ```

**Plats i kod:** `src/App.jsx` i `openEditModal()` (runt rad 1355)

---

### Problem: Google Calendar uppdateras inte vid redigering (v6.0.6)

**Symptom:** Lokala ändringar sparas men synkas inte till Google Calendar.

**Orsak:** Händelser från personliga kalendrar (Svante/Sarah) söktes endast i familjekalendern.

**Lösning:** Sök i rätt kalender baserat på `source`-fältet:
```javascript
const calendarsToSearch = [];
if (source && source.includes('Svante')) {
    calendarsToSearch.push(googleCalendar.CALENDAR_CONFIG.svante);
} else if (source && source.includes('Sarah')) {
    calendarsToSearch.push(googleCalendar.CALENDAR_CONFIG.sarah);
}
calendarsToSearch.push(googleCalendar.CALENDAR_CONFIG.familjen);

// Sök efter event via iCalUID i varje kalender
for (const searchCalId of calendarsToSearch) {
    const foundEvent = await googleCalendar.findEventByICalUID(iCalUID, searchCalId);
    if (foundEvent) {
        googleId = foundEvent.id;
        calendarId = searchCalId;
        break;
    }
}
```

**Plats i kod:** `server/index.js` i `/api/update-event` endpoint (runt rad 3192-3225)

---

## Projektstruktur

- `src/App.jsx` - Huvudkomponent för frontend
- `server/index.js` - Backend Express-server
- `server/googleCalendar.js` - Google Calendar API-integration
- `server/local_events.json` - Lokala händelser (shadow events)
- `server/calendar_cache.json` - Cache för externa kalendrar
- `server/google_event_map.json` - Mapping mellan ICS UID och Google Event ID
