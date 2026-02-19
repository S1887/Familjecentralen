import React from 'react';

// Month View with Multi-Day Event Spanning
// This component renders a monthly calendar where multi-day events span across multiple days

const MonthViewWithSpanning = ({
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
    newEvent,
    holidays = [],
    changeDay,
    onSwipe,
    newEventUids // Prop för V6.0 nya händelser
}) => {
    // Swipe Logic
    const touchStart = React.useRef(null);
    const touchEnd = React.useRef(null);
    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        touchEnd.current = null;
        touchStart.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e) => {
        touchEnd.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = () => {
        if (!touchStart.current || !touchEnd.current) return;
        const distance = touchStart.current - touchEnd.current;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe && onSwipe) onSwipe(1); // Next
        if (isRightSwipe && onSwipe) onSwipe(-1); // Prev
    };
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Build grid of days (42 cells = 6 weeks)
    const days = [];
    let startDay = firstDayOfMonth.getDay() - 1; // Mon=0...Sun=6
    if (startDay === -1) startDay = 6;

    const prevMonthLastDate = new Date(year, month, 0).getDate();
    for (let i = 0; i < startDay; i++) {
        days.push({ day: prevMonthLastDate - startDay + 1 + i, type: 'prev', date: new Date(year, month - 1, prevMonthLastDate - startDay + 1 + i) });
    }
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
        days.push({ day: i, type: 'current', date: new Date(year, month, i) });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
        days.push({ day: i, type: 'next', date: new Date(year, month + 1, i) });
    }

    // Process multi-day events
    const processedUids = new Set();
    const multiDayEvents = [];
    const singleDayEventsByCell = days.map(() => []);

    filteredEventsList.forEach(event => {
        if (processedUids.has(event.uid)) return;

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        const startDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
        const endDay = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
        const daysDiff = Math.round((endDay - startDay) / (1000 * 60 * 60 * 24));

        if (daysDiff > 0) {
            // Multi-day event - find which cells it spans
            let startIndex = -1;
            let endIndex = -1;

            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                const dayDate = new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate());

                if (dayDate.getTime() === startDay.getTime()) {
                    startIndex = i;
                }
                if (dayDate.getTime() === endDay.getTime()) {
                    endIndex = i;
                }
            }

            // Fallback for events starting before/ending after visible range
            if (startIndex === -1 && startDay < days[0].date) {
                startIndex = 0;
            }
            if (endIndex === -1 && endDay > days[days.length - 1].date) {
                endIndex = days.length - 1;
            }

            if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
                // Split into week rows (events can't span rows in grid layout)
                let currentStart = startIndex;
                while (currentStart <= endIndex) {
                    const rowEnd = Math.min(endIndex, Math.floor(currentStart / 7) * 7 + 6);
                    multiDayEvents.push({
                        ...event,
                        cellStart: currentStart,
                        cellEnd: rowEnd,
                        span: rowEnd - currentStart + 1,
                        row: Math.floor(currentStart / 7),
                        colStart: currentStart % 7,
                        isStart: currentStart === startIndex,
                        isEnd: rowEnd === endIndex
                    });
                    currentStart = rowEnd + 1;
                }
                processedUids.add(event.uid);
            }
        } else {
            // Single-day event
            for (let i = 0; i < days.length; i++) {
                if (isEventOnDate(event, days[i].date)) {
                    singleDayEventsByCell[i].push(event);
                    processedUids.add(event.uid);
                    break;
                }
            }
        }
    });

    // Group multi-day events by row
    const eventsByRow = {};
    multiDayEvents.forEach(ev => {
        if (!eventsByRow[ev.row]) eventsByRow[ev.row] = [];
        eventsByRow[ev.row].push(ev);
    });

    // Calculate per-cell slot count: how many spanning events actually pass through each cell
    // (a spanning event occupies cells cellStart..cellEnd, positioned at its row-level slotIndex)
    const cellSlots = days.map((_, idx) => {
        const eventsThrough = multiDayEvents.filter(ev => ev.cellStart <= idx && idx <= ev.cellEnd);
        if (eventsThrough.length === 0) return 0;
        const maxSlot = Math.max(...eventsThrough.map(ev => eventsByRow[ev.row].indexOf(ev)));
        return maxSlot + 1;
    });

    // Helper to get ISO week number
    const getWeekNumber = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };

    return (
        <div
            className="calendar-grid-month"
            style={{ position: 'relative', touchAction: 'pan-y' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* Header row: empty week-nr cell + day names */}
            <div className="calendar-day-header" style={{ fontSize: '0.65rem', opacity: 0.4 }}>V</div>
            {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map(d => (
                <div key={d} className="calendar-day-header">{d}</div>
            ))}

            {/* Calendar cells */}
            {days.map((d, idx) => {
                const isTodayCell = isSameDay(d.date, new Date());
                const isRed = holidays.some(h => isSameDay(h.start, d.date) && h.isRedDay);
                const row = Math.floor(idx / 7);
                const slotsInRow = cellSlots[idx] || 0;
                const dayEvents = singleDayEventsByCell[idx];
                const isFirstInRow = idx % 7 === 0;

                // Multi-day events that start in this cell
                const multiDayStartingHere = multiDayEvents.filter(ev => ev.cellStart === idx);

                return (<React.Fragment key={idx}>
                    {/* Week number cell at start of each row */}
                    {isFirstInRow && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'center',
                            paddingTop: '0.4rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            opacity: 0.35,
                            color: 'var(--card-text)',
                        }}>
                            {getWeekNumber(d.date)}
                        </div>
                    )}
                    <div
                        key={idx}
                        className={`calendar-cell ${d.type !== 'current' ? 'different-month' : ''} ${isTodayCell ? 'today' : ''}`}
                        style={{
                            position: 'relative',
                            paddingTop: slotsInRow > 0 ? `${slotsInRow * 1.6 + 1.5}rem` : '1.5rem'
                        }}
                        onClick={() => {
                            setSelectedDate(d.date);
                            setActiveTab('day-view');
                        }}
                    >
                        {/* Date number */}
                        <div style={{
                            position: 'absolute',
                            top: '0.3rem',
                            right: '0.5rem',
                            fontWeight: 'bold',
                            color: isRed ? '#ff4757' : 'inherit',
                            zIndex: 1
                        }}>
                            {d.day}
                        </div>

                        {/* Multi-day events that START in this cell */}
                        {multiDayStartingHere.map((ev) => {
                            const colorClass = getEventColorClass(ev);
                            const slotIndex = eventsByRow[ev.row].indexOf(ev);

                            const isNew = newEventUids && newEventUids.has(ev.uid);
                            return (
                                <div
                                    key={ev.uid + '-' + ev.cellStart}
                                    className={`calendar-event-spanning ${colorClass}`}
                                    style={{
                                        position: 'absolute',
                                        top: `${1.5 + slotIndex * 1.5}rem`,
                                        left: ev.isStart ? '0.2rem' : '0',
                                        right: ev.isEnd ? '0.2rem' : '0',
                                        width: `calc(${ev.span * 100}% - ${ev.isStart ? 0.2 : 0}rem - ${ev.isEnd ? 0.2 : 0}rem)`,
                                        padding: '0.15rem 0.4rem',
                                        fontSize: '0.7rem',
                                        fontWeight: '600',
                                        borderRadius: ev.isStart && ev.isEnd ? '3px' : ev.isStart ? '3px 0 0 3px' : ev.isEnd ? '0 3px 3px 0' : '0',
                                        background: 'var(--card-bg)',
                                        border: '1px solid var(--border-color)',
                                        cursor: 'pointer',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        zIndex: 10,
                                        opacity: ev.isTrashed || ev.cancelled ? 0.6 : 1,
                                        textDecoration: ev.isTrashed || ev.cancelled ? 'line-through' : 'none'
                                    }}
                                    onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                                    title={`${isNew ? 'NY!!! ' : ''}${ev.summary}${ev.location && ev.location !== 'Okänd plats' ? `\n📍 ${ev.location}` : ''}${ev.assignments && (ev.assignments.driver || ev.assignments.packer) ? `\n${ev.assignments.driver ? `Bil: ${ev.assignments.driver}` : ''}${ev.assignments.driver && ev.assignments.packer ? ' • ' : ''}${ev.assignments.packer ? `Ryggsäck: ${ev.assignments.packer}` : ''}` : ''}`}
                                >
                                    {ev.isTrashed && <span style={{ color: '#9b59b6', marginRight: '0.2rem' }}>EJ</span>}
                                    {ev.cancelled ? '🚫 ' : ''}{ev.summary}
                                </div>
                            );
                        })}

                        {/* Single-day events */}
                        {dayEvents.slice(0, 3 - Math.min(slotsInRow, 2)).map(ev => {
                            const colorClass = getEventColorClass(ev);
                            const isNew = newEventUids && newEventUids.has(ev.uid);
                            return (
                                <div
                                    key={ev.uid}
                                    className={`calendar-event ${colorClass}`}
                                    style={{
                                        textDecoration: ev.cancelled || ev.isTrashed ? 'line-through' : 'none',
                                        opacity: ev.cancelled || ev.isTrashed ? 0.6 : 1,
                                        border: isNew ? '1px solid #ff4757' : 'none'
                                    }}
                                    title={`${isNew ? 'NY!!! ' : ''}${ev.summary}${ev.location && ev.location !== 'Okänd plats' ? `\n📍 ${ev.location}` : ''}${ev.assignments && (ev.assignments.driver || ev.assignments.packer) ? `\n${ev.assignments.driver ? `Bil: ${ev.assignments.driver}` : ''}${ev.assignments.driver && ev.assignments.packer ? ' • ' : ''}${ev.assignments.packer ? `Ryggsäck: ${ev.assignments.packer}` : ''}` : ''}`}
                                    onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                                >
                                    {ev.isTrashed && <span style={{ color: '#9b59b6', marginRight: '0.2rem' }}>EJ</span>}
                                    {ev.cancelled ? '🚫 ' : ''}
                                    {ev.summary}
                                </div>
                            );
                        })}

                        {/* More events indicator */}
                        {dayEvents.length > (3 - Math.min(slotsInRow, 2)) && (
                            <div style={{ fontSize: '0.65rem', color: '#666', textAlign: 'center' }}>
                                + {dayEvents.length - (3 - Math.min(slotsInRow, 2))} till
                            </div>
                        )}
                    </div>
                </React.Fragment>);
            })}
        </div>
    );
};

export default MonthViewWithSpanning;
