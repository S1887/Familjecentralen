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

### Problem: Flerdagshändelser visas fel (v6.0.7)

**Symptom:**
1. Flerdagshändelser (t.ex. "Beredskap 17-20 april") visar fel datum i edit-modalen (off-by-one)
2. Flerdagshändelser visas bara på startdagen i kalendervyer

**Orsak:**
1. `toISOString()` konverterar till UTC vilket ger -1 dag för svenska tider
2. ICS/Google Calendar använder "exklusivt" slutdatum (midnatt nästa dag)
3. Kalendervyer filtrerade endast på `event.start`, inte om händelsen sträcker sig över dagen

**Lösning:**
1. Använd lokal datumformatering i `openEditModal()`:
   ```javascript
   const formatLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
   ```

2. Justera exklusivt slutdatum (midnatt → 23:59 föregående dag):
   ```javascript
   if (endDate.getHours() === 0 && endDate.getMinutes() === 0) {
       endDate = new Date(endDate.getTime() - 1);
       endTimeStr = '23:59';
   }
   ```

3. Expandera flerdagshändelser i listvyn och kolla om händelse sträcker sig över dag:
   ```javascript
   const isEventOnDay = (event, targetDay) => {
       // Event spans this day if: starts before day ends AND ends after day starts
       return eventStart <= dayEnd && eventEnd >= dayStart;
   };
   ```

**Plats i kod:**
- `src/App.jsx` - `openEditModal()`, `updateEvent()`, `isEventOnDate()`, `otherEvents`
- `src/components/MobileGridWeekView.jsx` - `isEventOnDay()`
- `src/components/NewHome.jsx` - `todaysEvents` filter

---

### Problem: Cache invalideras i onödan (v6.0.7)

**Symptom:** Händelser försvinner efter redigering i Home Assistant (tom cache vid serverstart)

**Orsak:** Fallback-logik invaliderade hela cachen om `cachedCalendarEvents.length === 0`

**Lösning:** Ta bort cache-invalidering som fallback - händelser sparas ändå i local_events.json:
```javascript
} else if (updatedEvent) {
    // Cache is empty but event was saved to local_events.json
    // DON'T invalidate cache - the event will be merged when fetched
    console.log('[Update] Cache empty, event saved to local_events.json (no cache invalidation)');
}
```

**Plats i kod:** `server/index.js` i `/api/update-event` och `/api/create-event`

---

## Projektstruktur

- `src/App.jsx` - Huvudkomponent för frontend
- `server/index.js` - Backend Express-server
- `server/googleCalendar.js` - Google Calendar API-integration
- `server/local_events.json` - Lokala händelser (shadow events)
- `server/calendar_cache.json` - Cache för externa kalendrar
- `server/google_event_map.json` - Mapping mellan ICS UID och Google Event ID
