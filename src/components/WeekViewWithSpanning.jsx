import React, { useRef, useEffect, useState, useMemo } from 'react';
import Icon from './Icon';

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
    newEvent,
    onSwipe: _onSwipe,
    newEventUids // V6.0 prop
}) => {
    // Scroll to Today on Mount/Update

    // Responsive Logic
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);



    const columnStyle = isMobile ? {
        flex: '1 0 auto',
        width: 'calc((100vw - 60px) / 3)',
        minWidth: 'min(150px, calc((100vw - 60px) / 3))',
        maxWidth: '100%'
    } : {
        flex: 1,
        width: 'auto',
        minWidth: 0,
        maxWidth: 'none'
    };

    const containerRef = useRef(null);

    // Memoize days array to prevent useEffect dependency issues
    const days = useMemo(() => {
        const result = [];
        const current = new Date(selectedDate);
        const dayOfWeek = current.getDay() || 7; // 1 (Mon) - 7 (Sun)

        // Set to Monday of this week
        const startOfWeek = new Date(current);
        startOfWeek.setDate(current.getDate() - dayOfWeek + 1);
        startOfWeek.setHours(0, 0, 0, 0);

        // Generate 7 days
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            result.push(d);
        }
        return result;
    }, [selectedDate]);

    // Scroll to Today on Mount/Update
    const scrollContainerRef = useRef(null);
    useEffect(() => {
        // Find today column
        const todayCol = document.getElementById('today-column-header');
        if (todayCol && scrollContainerRef.current) {
            const offset = todayCol.offsetLeft - 60; // Minus time axis
            scrollContainerRef.current.scrollLeft = Math.max(0, offset);
        }
    }, [selectedDate]);

    // Separate events
    const multiDayEvents = [];
    const singleDayEventsByDay = days.map(() => []);
    const timeEventsByDay = days.map(() => []); // For Desktop grid
    const processedUids = new Set();

    filteredEventsList.forEach(event => {
        // We might process the same event multiple times if we don't handle IDs carefully, 
        // but here we just classify them for rendering.
        // NOTE: The previous logic filtered by 'processedUids' to avoid duplication in the loops.
        // We should keep consistent logic.

        if (processedUids.has(event.uid)) return;

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Simple multi-day check: is duration > 24h OR spans across midnight to next day significantly?
        // Actually, let's stick to the previous robust logic:
        const startDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
        const endDay = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
        const daysDiff = Math.abs(endDay - startDay) / (1000 * 60 * 60 * 24); // Floating point diff

        // Check if it's strictly ALL DAY event flag
        const isAllDay = isAllDayEvent(event);

        // A truly multi-day spanning event
        if (daysDiff >= 1 || isAllDay) {
            // Logic for Multi-Day / All-Day
            // Calculate start/end indices relative to THIS week
            let startIndex = -1;
            let endIndex = -1;

            for (let i = 0; i < days.length; i++) {
                const day = days[i];
                const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());

                // If event STARTS on this day (or before, generally handled by 'processedUids'?? No, we need intersection)
                // Actually, let's keep basic intersection logic
                // If this event overlaps with this week...

                // Reuse previous logic for grid columns:
                if (dayStart.getTime() === startDay.getTime()) startIndex = i;
                if (dayStart.getTime() === endDay.getTime()) endIndex = i;
            }

            // Handle bounds
            if (startIndex === -1 && startDay < days[0]) startIndex = 0;
            if (endIndex === -1 && endDay > days[6]) endIndex = 6;

            // Should we show it?
            // Only if it actually intersects this week
            const eventEndActual = new Date(event.end);
            const weekStart = days[0];
            const weekEnd = new Date(days[6]);
            weekEnd.setHours(23, 59, 59, 999);

            if (new Date(event.start) < weekEnd && eventEndActual > weekStart) {
                // If we didn't get valid indices for grid but it intersects, force them
                if (startIndex === -1) startIndex = 0;
                if (endIndex === -1) endIndex = 6;

                // Ensure start <= end
                if (startIndex <= endIndex) {
                    multiDayEvents.push({
                        ...event,
                        gridStart: startIndex + 1,
                        gridEnd: endIndex + 2,
                        span: endIndex - startIndex + 1
                    });
                    processedUids.add(event.uid);
                }
            }

        } else {
            // Single Day Time-Bound Event
            // Find which day it belongs to
            for (let i = 0; i < days.length; i++) {
                if (isEventOnDate(event, days[i])) {
                    singleDayEventsByDay[i].push(event);
                    timeEventsByDay[i].push(event); // Same for now, but helpful for desktop separation
                    processedUids.add(event.uid);
                    break;
                }
            }
        }
    });



    // --- RENDER DESKTOP (Time Grid) ---
    const [showFullDay, setShowFullDay] = React.useState(false);

    // Settings
    const HOUR_HEIGHT = 60; // px

    // Calculate visible range
    let minHour = 6;
    let maxHour = 22;

    if (!showFullDay) {
        // Find earliest and latest event hours
        let earliest = 24;
        let latest = 0;
        let hasTimeEvents = false;

        days.forEach((day, i) => {
            timeEventsByDay[i].forEach(ev => {
                const h = new Date(ev.start).getHours();
                if (h < earliest) earliest = h;
                const endH = new Date(ev.end).getHours() + (new Date(ev.end).getMinutes() > 0 ? 1 : 0);
                if (endH > latest) latest = endH;
                hasTimeEvents = true;
            });
        });

        if (hasTimeEvents) {
            // Start at 06:00 unless events force us earlier
            if (earliest < 6) {
                minHour = Math.max(0, earliest - 1);
            } else {
                minHour = 6;
            }

            maxHour = Math.max(latest + 1, 22); // Show 1 hour after latest, min end 22:00
            if (maxHour > 24) maxHour = 24;
        }
    } else {
        minHour = 0;
        maxHour = 24;
    }

    const START_HOUR = minHour;
    const END_HOUR = maxHour;
    const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

    return (
        <div
            ref={scrollContainerRef}
            className="week-view-desktop"

            style={{
                width: '100%',
                height: 'auto',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-surface)',
                borderRadius: '24px',
                overflowX: 'auto',
                overflowY: 'visible',
                border: '1px solid var(--border-color)',
                scrollBehavior: 'smooth',
                scrollSnapType: 'x mandatory',
                scrollPaddingLeft: '60px' // Fix for sticky time axis covering first column
            }}
        >

            {/* 1. Header Row (Day Names) */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', minHeight: '60px', minWidth: 'min-content' }}>
                <div style={{
                    width: '60px',
                    flexShrink: 0,
                    borderRight: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    position: 'sticky',
                    left: 0,
                    zIndex: 30
                }}></div> {/* Time Axis Spacer */}
                {days.map((d) => {
                    const isToday = isSameDay(d, new Date());
                    return (
                        <div
                            key={d.toString()}
                            id={isToday ? 'today-column-header' : undefined}
                            style={{
                                ...columnStyle,
                                scrollSnapAlign: 'start',
                                textAlign: 'center',
                                padding: '0.5rem',
                                background: isToday ? 'rgba(46, 213, 115, 0.1)' : 'transparent',
                                borderRight: '1px solid var(--border-color)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center'
                            }}
                        >
                            <div style={{ fontWeight: 'bold', color: isToday ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem' }}>{d.toLocaleDateString('sv-SE', { weekday: 'short' })}</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: isToday ? 'bold' : 'normal', color: isToday ? 'var(--accent)' : 'var(--text-main)' }}>{d.getDate()}</div>
                        </div>
                    );
                })}
            </div>

            {/* 2. All-Day / Spanning Events Row */}
            {multiDayEvents.length > 0 && (
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-main)', minWidth: 'min-content' }}>
                    <div style={{
                        width: '60px',
                        flexShrink: 0,
                        borderRight: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        padding: '0.5rem',
                        position: 'sticky',
                        left: 0,
                        zIndex: 30,
                        background: 'var(--bg-main)'
                    }}>
                        Heldag
                    </div>
                    <div style={{ flex: 1, position: 'relative', minHeight: `${multiDayEvents.length * 35 + 10}px` }}>
                        {multiDayEvents.map((event, index) => {
                            const colorClass = getEventColorClass(event);
                            const widthPercent = (event.span / 7) * 100;
                            const leftPercent = ((event.gridStart - 1) / 7) * 100;
                            const isNew = newEventUids && newEventUids.has(event.uid);

                            return (
                                <div key={event.uid} className={`card ${colorClass}`}
                                    onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                                    style={{
                                        position: 'absolute',
                                        top: `${5 + index * 32}px`,
                                        left: `${leftPercent}%`,
                                        width: `calc(${widthPercent}% - 6px)`,
                                        height: '28px',
                                        marginLeft: '3px',
                                        fontSize: '0.8rem',
                                        padding: '0 8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        borderRadius: '6px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                        cursor: 'pointer',
                                        overflow: 'hidden',
                                        whiteSpace: 'nowrap',
                                        zIndex: 10,
                                        border: isNew ? '2px solid #ff4757' : 'none' // Rely on background color
                                    }}
                                >
                                    {isNew && <span style={{ color: '#ff4757', fontWeight: 'bold', marginRight: '4px' }}>● </span>}
                                    <span style={{ fontWeight: '600', marginRight: '4px' }}>{event.summary}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 3. Main Scrollable Grid (Time Axis + Events) */}
            <div style={{ flex: 1, overflowY: 'visible', position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 'min-content' }} ref={containerRef}>

                {/* Expand/Collapse Button Top */}
                {(START_HOUR > 0 || showFullDay) && (
                    <button
                        onClick={() => setShowFullDay(!showFullDay)}
                        style={{
                            width: '100%', padding: '0.75rem', background: 'var(--bg-main)', border: 'none', borderBottom: '1px solid var(--border-color)',
                            color: 'white', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                            letterSpacing: '0.5px'
                        }}
                    >
                        <Icon name={showFullDay ? "minimize" : "maximize"} size={16} />
                        {showFullDay ? "Återgå till kompakt vy" : `Visa tidiga morgontimmar (00:00 - ${START_HOUR.toString().padStart(2, '0')}:00)`}
                    </button>
                )}

                <div style={{ display: 'flex', position: 'relative', flexGrow: 1 }}>
                    {/* Time Axis - Sticky */}
                    <div style={{
                        width: '60px',
                        flexShrink: 0,
                        borderRight: '1px solid var(--border-color)',
                        background: 'var(--bg-main)',
                        position: 'sticky',
                        left: 0,
                        zIndex: 30
                    }}>
                        {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => {
                            const hour = START_HOUR + i;
                            return (
                                <div key={hour} style={{ height: `${HOUR_HEIGHT}px`, position: 'relative' }}>
                                    <span style={{ position: 'absolute', top: '-10px', right: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {hour !== 0 ? `${hour.toString().padStart(2, '0')}:00` : ''}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Grid Columns */}
                    <div style={{ flex: 1, position: 'relative', display: 'flex' }}>

                        {/* Background Grid Lines */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                            {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
                                <div key={i} style={{ height: `${HOUR_HEIGHT}px`, borderBottom: '1px solid var(--border-color)', borderImage: 'linear-gradient(to right, transparent 0%, var(--border-color) 100%) 1' }}></div>
                            ))}
                        </div>

                        {/* Day Columns & Events */}
                        {days.map((d, dayIndex) => {
                            // 1. Get events for this day
                            let events = [...timeEventsByDay[dayIndex]];

                            // 2. Sort by Start Time (Critical for overlap logic)
                            events.sort((a, b) => new Date(a.start) - new Date(b.start));

                            // 3. Group into Overlapping Clusters
                            const clusters = [];
                            let currentCluster = [];
                            let clusterEnd = null;

                            events.forEach(event => {
                                const start = new Date(event.start).getTime();
                                const end = new Date(event.end).getTime();

                                if (currentCluster.length === 0) {
                                    currentCluster.push(event);
                                    clusterEnd = end;
                                } else {
                                    // If start is before cluster end, it overlaps (or is contiguous-ish)
                                    // We use a small buffer if needed, but strict inequality is usually fine for 'visual overlap'
                                    if (start < clusterEnd) {
                                        currentCluster.push(event);
                                        clusterEnd = Math.max(clusterEnd, end);
                                    } else {
                                        // Close cluster
                                        clusters.push(currentCluster);
                                        currentCluster = [event];
                                        clusterEnd = end;
                                    }
                                }
                            });
                            if (currentCluster.length > 0) clusters.push(currentCluster);

                            // 4. Process clusters to assign "Lanes"
                            const processedEvents = [];
                            clusters.forEach(cluster => {
                                const lanes = []; // Array of last_event_end_time for each lane

                                cluster.forEach(event => {
                                    const start = new Date(event.start).getTime();
                                    const end = new Date(event.end).getTime();
                                    let placed = false;

                                    // Try to place in existing lane
                                    for (let i = 0; i < lanes.length; i++) {
                                        if (lanes[i] <= start) {
                                            lanes[i] = end;
                                            event.laneIndex = i;
                                            placed = true;
                                            break;
                                        }
                                    }

                                    // New lane
                                    if (!placed) {
                                        lanes.push(end);
                                        event.laneIndex = lanes.length - 1;
                                    }
                                });

                                // Assign widths based on max lanes in this cluster
                                const numLanes = lanes.length;
                                cluster.forEach(event => {
                                    event.clusterWidth = 100 / numLanes;
                                    event.clusterLeft = event.laneIndex * event.clusterWidth;
                                    processedEvents.push(event);
                                });
                            });

                            const isToday = isSameDay(d, new Date());

                            return (
                                <div key={d.toString()} style={{
                                    ...columnStyle,
                                    scrollSnapAlign: 'start',
                                    borderRight: '1px solid var(--border-color)',
                                    position: 'relative',
                                    background: isToday ? 'rgba(46, 213, 115, 0.02)' : 'transparent',
                                    height: `${TOTAL_HEIGHT}px`
                                }}
                                    onClick={(e) => {
                                        if (window.confirm('Skapa ny händelse här?')) {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const offsetY = e.clientY - rect.top;
                                            const clickedHour = Math.floor(START_HOUR + (offsetY / HOUR_HEIGHT));

                                            // Format start time
                                            const startH = Math.min(Math.max(0, clickedHour), 23);
                                            const startTime = `${startH.toString().padStart(2, '0')}:00`;

                                            // Format end time (+1h)
                                            const endH = (startH + 1) % 24;
                                            const endTime = `${endH.toString().padStart(2, '0')}:00`;

                                            setSelectedDate(d);
                                            setNewEvent({
                                                ...newEvent,
                                                date: d.toLocaleDateString('sv-SE'),
                                                time: startTime,
                                                endTime: endTime
                                            });
                                            setActiveTab('create-event');
                                        }
                                    }}
                                >
                                    {/* Active Time Indicator (if today and within view) */}
                                    {isToday && (() => {
                                        const now = new Date();
                                        const totalMinutes = now.getHours() * 60 + now.getMinutes();
                                        const startViewMinutes = START_HOUR * 60;
                                        if (totalMinutes >= startViewMinutes && totalMinutes < END_HOUR * 60) {
                                            const topPx = (totalMinutes - startViewMinutes) * (HOUR_HEIGHT / 60);
                                            return (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: `${topPx}px`,
                                                    left: 0,
                                                    right: 0,
                                                    height: '2px',
                                                    background: 'var(--accent)',
                                                    zIndex: 20,
                                                    pointerEvents: 'none'
                                                }}>
                                                    <div style={{ position: 'absolute', left: '-5px', top: '-4px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)' }}></div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}

                                    {/* Render Events */}
                                    {processedEvents.map((event) => {
                                        const start = new Date(event.start);
                                        const end = new Date(event.end);

                                        // Minutes from start of day
                                        const startOfDayMinutes = start.getHours() * 60 + start.getMinutes();
                                        const startViewMinutes = START_HOUR * 60;
                                        const topPx = (startOfDayMinutes - startViewMinutes) * (HOUR_HEIGHT / 60);
                                        const durationMinutes = (end - start) / (1000 * 60);
                                        const heightPx = Math.max(durationMinutes * (HOUR_HEIGHT / 60), 25);

                                        // Skip rendering if totally out of bounds (although logic prevents this mostly)
                                        if (topPx + heightPx < 0 || topPx > TOTAL_HEIGHT) return null;

                                        const colorClass = getEventColorClass(event);
                                        const isNew = newEventUids && newEventUids.has(event.uid);

                                        return (
                                            <div
                                                key={event.uid}
                                                className={`card ${colorClass}`}
                                                onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                                                style={{
                                                    position: 'absolute',
                                                    top: `${topPx}px`,
                                                    // SIDE-BY-SIDE LOGIC: Use calculated left/width
                                                    left: `${event.clusterLeft}%`,
                                                    width: `calc(${event.clusterWidth}% - 4px)`, // -4px for gap
                                                    height: `${heightPx}px`,
                                                    padding: '2px 4px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: '2px', // Squared corners
                                                    zIndex: 10,
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
                                                    cursor: 'pointer',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    lineHeight: '1.2',
                                                    border: isNew ? '2px solid #ff4757' : 'none'
                                                }}
                                            >

                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '700', fontSize: '0.75rem' }}>
                                                    {isNew && <span style={{ color: '#ff4757', marginRight: '2px' }}>● </span>}
                                                    {event.summary}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WeekViewWithSpanning;
