// Week View with Multi-Day Event Spanning Logic

// Helper to calculate spanning events
// eslint-disable-next-line no-unused-vars
function processWeekEvents(filteredEventsList, days) {
    const multiDayEvents = [];
    const singleDayEventsByDay = days.map(() => []);
    const processedMultiDayUids = new Set();

    filteredEventsList.forEach(event => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        const startDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
        const endDay = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
        const daysDiff = Math.round((endDay - startDay) / (1000 * 60 * 60 * 24));

        if (daysDiff > 0 && !processedMultiDayUids.has(event.uid)) {
            // Multi-day event - find which columns it spans
            let startIndex = -1;
            let endIndex = -1;

            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                if (startIndex === -1 && day >= startDay) {
                    startIndex = i;
                }
                if (day <= endDay) {
                    endIndex = i;
                }
            }

            if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
                const gridStart = startIndex + 1; // CSS Grid is 1-indexed
                const gridEnd = endIndex + 2; // Grid end is exclusive
                multiDayEvents.push({
                    ...event,
                    gridStart,
                    gridEnd,
                    span: gridEnd - gridStart
                });
                processedMultiDayUids.add(event.uid);
            }
        } else if (!processedMultiDayUids.has(event.uid)) {
            // Single day event
            for (let i = 0; i < days.length; i++) {
                if (isEventOnDate(event, days[i])) {
                    singleDayEventsByDay[i].push(event);
                    break;
                }
            }
        }
    });

    return { multiDayEvents, singleDayEventsByDay };
}

// Helper to check if event is on a specific date
function isEventOnDate(event, date) {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const startDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
    const endDay = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());

    return checkDate >= startDay && checkDate <= endDay;
}
