import React from 'react';

const WeekViewWithSpanning = ({
    selectedDate,
    filteredEventsList,
    isSameDay,
    isEventOnDate,
    isAllDayEvent,
    getEventColorClass,
    openEditModal,
    setSelectedDate,
    setNewEvent,
    setActiveTab,
    newEvent
}) => {
    const days = [];
    const current = new Date(selectedDate);
    const dayOfWeek = current.getDay() || 7;
    current.setDate(current.getDate() - dayOfWeek + 1);

    for (let i = 0; i < 7; i++) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }

    // Separate multi-day and single-day events
    const multiDayEvents = [];
    const singleDayEventsByDay = days.map(() => []);
    const processedUids = new Set();

    filteredEventsList.forEach(event => {
        if (processedUids.has(event.uid)) return;

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        const startDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
        const endDay = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
        const daysDiff = Math.round((endDay - startDay) / (1000 * 60 * 60 * 24));

        if (daysDiff > 0) {
            let startIndex = -1;
            let endIndex = -1;

            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                const dayDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());

                // Exact match for start day
                if (dayDate.getTime() === startDay.getTime()) {
                    startIndex = i;
                }

                // Exact match for end day
                if (dayDate.getTime() === endDay.getTime()) {
                    endIndex = i;
                }
            }

            // Fallback: if event starts before the week, start from Monday
            if (startIndex === -1 && startDay < days[0]) {
                startIndex = 0;
            }

            // Fallback: if event ends after the week, end on Sunday
            if (endIndex === -1 && endDay > days[6]) {
                endIndex = 6;
            }

            if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
                multiDayEvents.push({
                    ...event,
                    gridStart: startIndex + 1,
                    gridEnd: endIndex + 2,
                    span: endIndex - startIndex + 1
                });
                processedUids.add(event.uid);
            }
        } else {
            for (let i = 0; i < days.length; i++) {
                if (isEventOnDate(event, days[i])) {
                    singleDayEventsByDay[i].push(event);
                    processedUids.add(event.uid);
                    break;
                }
            }
        }
    });

    return (
        <div style={{ width: '100%' }}>
            {/* Main grid for day columns */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '0.5rem',
                position: 'relative'
            }}>
                {days.map((d, index) => {
                    const dayEvents = singleDayEventsByDay[index].sort((a, b) => new Date(a.start) - new Date(b.start));
                    const isTodayHeader = isSameDay(d, new Date());

                    return (
                        <div
                            key={d.toISOString()}
                            className="week-column"
                            id={isTodayHeader ? 'today-column' : undefined}
                            style={{
                                background: 'var(--card-bg)',
                                borderRadius: '24px',
                                overflow: 'visible',
                                display: 'flex',
                                flexDirection: 'column',
                                cursor: 'pointer',
                                minHeight: '400px',
                                position: 'relative'
                            }}
                            onClick={() => {
                                if (window.confirm('Vill du skapa en ny händelse?')) {
                                    setSelectedDate(d);
                                    setNewEvent({ ...newEvent, date: d.toLocaleDateString('sv-SE') });
                                    setActiveTab('create-event');
                                }
                            }}
                        >
                            <div className="week-column-header" style={{
                                padding: '1rem',
                                textAlign: 'center',
                                background: isTodayHeader ? '#2ed573' : 'rgba(255,255,255,0.03)',
                                color: isTodayHeader ? 'white' : 'var(--text-main)',
                                fontWeight: 'bold',
                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                <div style={{ textTransform: 'capitalize', fontSize: '1.1rem' }}>
                                    {d.toLocaleDateString('sv-SE', { weekday: 'short' })}
                                </div>
                                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                                    {d.getDate()}/{d.getMonth() + 1}
                                </div>
                            </div>

                            <div className="week-column-body" style={{
                                padding: '0.5rem',
                                flexGrow: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                paddingTop: `${multiDayEvents.length * 55 + 10}px` // Space for spanning events
                            }}>
                                {dayEvents.map(ev => {
                                    const colorClass = getEventColorClass(ev);
                                    return (
                                        <div
                                            key={ev.uid}
                                            className={`card ${colorClass}`}
                                            style={{
                                                padding: '0.8rem',
                                                fontSize: '0.8rem',
                                                marginBottom: '0',
                                                borderRadius: '16px',
                                                background: 'rgba(255,255,255,0.08)',
                                                border: 'none',
                                                cursor: 'pointer'
                                            }}
                                            onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                                        >
                                            <div style={{ fontWeight: 'bold', opacity: 0.9 }}>
                                                {isAllDayEvent(ev) ? 'Heldag' : new Date(ev.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div style={{
                                                fontWeight: 600,
                                                fontSize: '0.9rem',
                                                textDecoration: ev.isTrashed ? 'line-through' : 'none',
                                                opacity: ev.isTrashed ? 0.6 : 1
                                            }}>
                                                {ev.isTrashed && <span style={{ color: '#9b59b6', marginRight: '0.3rem', fontSize: '0.7em', textDecoration: 'none', display: 'inline-block' }}>EJ AKTUELL</span>}
                                                {ev.summary}
                                            </div>
                                            {ev.location && ev.location !== 'Okänd plats' && (
                                                <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                                    📍 {ev.location}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {/* Multi-day spanning events - positioned absolutely over the grid */}
                {multiDayEvents.map((event, index) => {
                    const colorClass = getEventColorClass(event);
                    const columnWidth = 100 / 7; // Each column is 1/7 of the width
                    const gapSize = 0.5; // rem

                    return (
                        <div
                            key={event.uid}
                            className={`card ${colorClass}`}
                            style={{
                                position: 'absolute',
                                top: `${90 + index * 55}px`, // Below headers (90px) + stacked
                                left: `${(event.gridStart - 1) * columnWidth}%`,
                                width: `calc(${event.span * columnWidth}% - 0.5rem)`,
                                padding: '0.6rem 0.8rem',
                                fontSize: '0.85rem',
                                borderRadius: '12px',
                                background: 'rgba(255,255,255,0.08)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                overflow: 'hidden',
                                zIndex: 5,
                                opacity: event.isTrashed ? 0.6 : 1
                            }}
                            onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                        >
                            <div style={{
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                textDecoration: event.isTrashed ? 'line-through' : 'none'
                            }}>
                                {event.isTrashed && <span style={{ color: '#9b59b6', marginRight: '0.3rem', fontSize: '0.8em', textDecoration: 'none' }}>EJ AKTUELL</span>}
                                {event.summary}
                            </div>
                            <div style={{
                                fontSize: '0.7rem',
                                opacity: 0.8,
                                whiteSpace: 'nowrap',
                                marginLeft: '0.5rem'
                            }}>
                                {new Date(event.start).getDate()}/{new Date(event.start).getMonth() + 1} - {new Date(event.end).getDate()}/{new Date(event.end).getMonth() + 1}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WeekViewWithSpanning;
