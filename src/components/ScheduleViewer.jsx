import React, { useState, useMemo, useRef, useEffect } from 'react';
import Icon from './Icon';

const ScheduleViewer = ({ events, initialStudent }) => {
    const validStudents = ['Algot', 'Tuva'];
    // Initialize state directly from prop - no useEffect needed
    const getValidStudent = (student) => validStudents.includes(student) ? student : 'Algot';
    const [selectedStudent, setSelectedStudent] = useState(() => getValidStudent(initialStudent));

    const [weekOffset, setWeekOffset] = useState(0);
    const scrollRef = useRef(null);

    // Student colors (borders/indicators)
    const studentColors = {
        'Algot': '#89CFF0', // Pastel Blue
        'Tuva': '#DDA0DD'   // Plum/Pastel Purple
    };

    const studentColor = studentColors[selectedStudent] || '#A9A9A9';

    // Subject colors - Updated to be slightly more vibrant/integrated
    const getSubjectColor = (summary) => {
        const subjectLower = (summary || '').toLowerCase();

        // Using slightly more saturated/standard colors to match app theme better
        if (subjectLower.includes('fritids')) return '#DCEDC8'; // Light Green (lighter than NO)
        if (subjectLower.includes('svenska')) return '#FFF59D'; // Yellow
        if (subjectLower.includes('matematik') || subjectLower.includes('matte')) return '#90CAF9'; // Blue
        if (subjectLower.includes('engelska')) return '#EF9A9A'; // Red
        if (subjectLower.includes('samhällo') || subjectLower.includes('so')) return '#CE93D8'; // Purple
        if (subjectLower.includes('natur') || subjectLower.includes('no') || subjectLower.includes('biologi')) return '#80CBC4'; // Teal
        if (subjectLower.includes('idrott') || subjectLower.includes('gympa')) return '#FFCC80'; // Orange
        if (subjectLower.includes('slöjd') || subjectLower.includes('trä')) return '#C5E1A5'; // Light Green
        if (subjectLower.includes('musik')) return '#FFAB91'; // Deep Orange
        if (subjectLower.includes('bild') || subjectLower.includes('konst')) return '#B39DDB'; // Deep Purple
        if (subjectLower.includes('teknik')) return '#B0BEC5'; // Blue Grey

        return 'var(--card-bg)'; // Fallback to theme card background
    };

    // Filter events for the schedule
    const scheduleEvents = useMemo(() => {
        return events.filter(e => {
            if (!e.isLesson) return false;
            if (e.student !== selectedStudent) return false;
            return true;
        });
    }, [events, selectedStudent]);

    const getWeekDays = (offset) => {
        const now = new Date();
        const currentDay = now.getDay();
        const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setDate(diff + (offset * 7));

        const days = [];
        for (let i = 0; i < 5; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            days.push(d);
        }
        return days;
    };

    const getWeekNumber = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };

    const weekDays = getWeekDays(weekOffset);
    const weekNumber = getWeekNumber(weekDays[0]);

    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- GRID LOGIC ---
    // UPDATED: Larger height and fixed range 8-16
    const HOUR_HEIGHT = 100; // Increased from 60
    const [showFullDay, setShowFullDay] = useState(false);

    // Default Fixed Range 06:00 - 17:00 (Expanded for Fritids)
    let minHour = 6;
    let maxHour = 17;

    // Only expand if explicitly requested via showFullDay
    if (showFullDay) {
        minHour = 0;
        maxHour = 24;
    }

    const START_HOUR = minHour;
    const END_HOUR = maxHour;
    const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

    // Mobile optimization for time axis
    const timeColWidth = isMobile ? '35px' : '60px';

    // Mobile: Show fewer columns
    const columnStyle = isMobile ? {
        flex: `0 0 calc((100vw - ${timeColWidth}) / 3)`, // Show 3 days on mobile
        minWidth: `calc((100vw - ${timeColWidth}) / 3)`,
        maxWidth: '100%'
    } : {
        flex: 1,
        width: 'auto',
        minWidth: 0,
        maxWidth: 'none'
    };

    // Find displayed events for this week (for optimization/rendering)
    const displayedEvents = useMemo(() => {
        const weekDateStrings = weekDays.map(d => d.toISOString().split('T')[0]);
        const visibleEvents = scheduleEvents.filter(e => weekDateStrings.includes(e.start.split('T')[0]));

        // Generate Fritids events
        const fritidsEvents = weekDays.flatMap(d => {
            const dayNum = d.getDay(); // 1=Mon, ..., 5=Fri
            const dateStr = d.toISOString().split('T')[0];

            // Fritids end times
            const endTimes = {
                1: '15:45', // Mon
                2: '16:40', // Tue
                3: '15:45', // Wed
                4: '16:40', // Thu
                5: '13:10'  // Fri
            };
            const endTimeStr = endTimes[dayNum];

            if (!endTimeStr) return [];

            const toLocalISO = (date) => {
                const pad = (n) => n.toString().padStart(2, '0');
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
            };

            const dayBlocks = [];

            // 1. Morning Block: 06:50 - 08:00
            const morningStart = new Date(d);
            morningStart.setHours(6, 50, 0);
            const morningEnd = new Date(d);
            morningEnd.setHours(8, 0, 0);

            dayBlocks.push({
                uid: `fritids-morning-${d.getTime()}`,
                summary: 'Fritids',
                start: toLocalISO(morningStart),
                end: toLocalISO(morningEnd),
                isLesson: true,
                location: '',
                student: selectedStudent
            });

            // 2. Afternoon Block: After last lesson - End Time
            // Find all lessons for this day
            const dailyLessons = visibleEvents.filter(e => e.start.startsWith(dateStr));

            if (dailyLessons.length > 0) {
                // Find the latest end time
                let lastLessonEnd = new Date(0); // Epoch

                dailyLessons.forEach(e => {
                    const eEnd = new Date(e.end);
                    if (eEnd > lastLessonEnd) {
                        lastLessonEnd = eEnd;
                    }
                });

                // Afternoon Fritids End
                const afternoonEnd = new Date(d);
                const [eh, em] = endTimeStr.split(':').map(Number);
                afternoonEnd.setHours(eh, em, 0);

                // Only add if afternoon fritids ends after the last lesson (and is valid)
                if (afternoonEnd > lastLessonEnd) {
                    dayBlocks.push({
                        uid: `fritids-afternoon-${d.getTime()}`,
                        summary: 'Fritids',
                        start: toLocalISO(lastLessonEnd), // Start immediately after last lesson
                        end: toLocalISO(afternoonEnd),
                        isLesson: true,
                        location: '',
                        student: selectedStudent
                    });
                }
            } else {
                // Fallback if no lessons? (e.g. lov/holiday but fritids open?)
                // For now, assume school day logic as requested: "direkt efter deras sista lektion"
                // If no lessons, effectively no afternoon start point defined by logic. 
                // We could default to 13:00 or similar if needed, but user didn't specify.
                // Let's skip afternoon if no lessons to avoid guessing wrong.
            }

            return dayBlocks;
        });

        return [...visibleEvents, ...fritidsEvents];
    }, [scheduleEvents, weekDays, selectedStudent]);

    useEffect(() => {
        if (scrollRef.current && isMobile) {
            let targetIndex = 0;
            if (weekOffset === 0) {
                const day = new Date().getDay();
                // 0=Sun, 1=Mon, ..., 6=Sat
                if (day === 0 || day === 6) {
                    targetIndex = 4; // Friday if weekend
                } else {
                    targetIndex = Math.max(0, day - 1); // Mon=1 -> 0
                }
            } else {
                targetIndex = 0; // Monday for other weeks
            }

            const targetCol = document.getElementById(`schedule-col-${targetIndex}`);
            if (targetCol) {
                // Ensure we respect the padding when manually scrolling too
                const offset = targetCol.offsetLeft - parseInt(timeColWidth);
                scrollRef.current.scrollLeft = Math.max(0, offset);
            }
        }
    }, [weekOffset, isMobile, timeColWidth]);

    return (
        <div className="schedule-viewer-container" style={{
            background: 'var(--bg-surface)',
            padding: isMobile ? '0' : '1rem',
            borderRadius: isMobile ? '0' : '16px',
            minHeight: isMobile ? '100vh' : 'auto'
        }}>
            {/* Header */}
            <div className="schedule-header" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: '500', margin: 0, color: 'var(--text-main)' }}>Skolschema</h3>
                <div className="student-selector" style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                    {validStudents.map(student => (
                        <button
                            key={student}
                            onClick={() => setSelectedStudent(student)}
                            style={{
                                background: selectedStudent === student
                                    ? (student === 'Algot' ? '#89CFF0' : '#DDA0DD')
                                    : 'var(--bg-element)',
                                color: selectedStudent === student ? '#2c3e50' : 'var(--text-muted)',
                                border: `1px solid ${selectedStudent === student ? 'transparent' : 'var(--border-color)'}`,
                                padding: '0.6rem 1.5rem',
                                borderRadius: '8px', // Slightly squared buttons too?
                                fontSize: '0.95rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                transform: selectedStudent === student ? 'scale(1.02)' : 'scale(1)'
                            }}
                        >
                            {student}
                        </button>
                    ))}
                </div>
            </div>

            {/* Week Navigation */}
            <div className="week-navigation" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                marginBottom: '1rem'
            }}>
                <button
                    onClick={() => setWeekOffset(weekOffset - 1)}
                    style={{
                        background: 'var(--bg-element)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        padding: '0.5rem 0.8rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '1rem'
                    }}
                >
                    ◀
                </button>
                <span style={{
                    fontWeight: '500',
                    fontSize: '1rem',
                    minWidth: '100px',
                    textAlign: 'center',
                    color: 'var(--text-main)',
                    background: 'var(--bg-element)',
                    border: '1px solid var(--border-color)',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px'
                }}>
                    v.{weekNumber}
                </span>
                <button
                    onClick={() => setWeekOffset(weekOffset + 1)}
                    style={{
                        background: 'var(--bg-element)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        padding: '0.5rem 0.8rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '1rem'
                    }}
                >
                    ▶
                </button>
                {weekOffset !== 0 && (
                    <button
                        onClick={() => setWeekOffset(0)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: '500'
                        }}
                    >
                        Idag
                    </button>
                )}
            </div>

            {/* Main Grid Container */}
            <div
                ref={scrollRef}
                className="schedule-grid-container"
                style={{
                    width: '100%',
                    height: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-main)', // Darker background for grid
                    borderRadius: '12px',
                    overflowX: 'auto',
                    overflowY: 'visible',
                    border: '1px solid var(--border-color)',
                    scrollBehavior: 'smooth',
                    scrollSnapType: 'x mandatory',
                    // CRITICAL FIX: Ensure scroll snapping respects the sticky column width
                    scrollPaddingLeft: timeColWidth
                }}
            >
                {/* 1. Header Row */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', minHeight: '50px', background: 'var(--bg-surface)' }}>
                    <div style={{
                        width: timeColWidth,
                        flexShrink: 0,
                        borderRight: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        position: 'sticky',
                        left: 0,
                        zIndex: 30
                    }}></div>
                    {weekDays.map((d) => {
                        const dateStr = d.toISOString().split('T')[0];
                        const isToday = new Date().toISOString().split('T')[0] === dateStr;
                        return (
                            <div
                                key={d.toString()}
                                style={{
                                    ...columnStyle,
                                    scrollSnapAlign: 'start',
                                    textAlign: 'center',
                                    padding: '0.5rem',
                                    background: isToday ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
                                    borderRight: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    color: 'var(--text-main)'
                                }}
                            >
                                <div style={{ fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'capitalize', fontSize: '0.85rem' }}>{d.toLocaleDateString('sv-SE', { weekday: 'short' })}</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--accent)' : 'var(--text-main)' }}>{d.getDate()}</div>
                            </div>
                        );
                    })}
                </div>

                {/* 2. Main Scrollable Grid */}
                <div style={{ flex: 1, overflowY: 'visible', position: 'relative', display: 'flex', flexDirection: 'column' }}>

                    {/* Expand Button */}
                    <button
                        onClick={() => setShowFullDay(!showFullDay)}
                        style={{
                            width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: 'none', borderBottom: '1px solid var(--border-color)',
                            color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        <Icon name={showFullDay ? "minimize" : "maximize"} size={14} />
                        {showFullDay ? "Visa 08-16" : "Visa heldag"}
                    </button>

                    <div style={{ display: 'flex', position: 'relative', flexGrow: 1 }}>
                        {/* Time Axis */}
                        <div style={{
                            width: timeColWidth,
                            flexShrink: 0,
                            borderRight: '1px solid var(--border-color)',
                            background: 'var(--bg-surface)',
                            position: 'sticky',
                            left: 0,
                            zIndex: 30
                        }}>
                            {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => {
                                const hour = START_HOUR + i;
                                return (
                                    <div key={hour} style={{ height: `${HOUR_HEIGHT}px`, position: 'relative' }}>
                                        <span style={{
                                            position: 'absolute',
                                            top: '-10px',
                                            right: isMobile ? '4px' : '8px',
                                            fontSize: isMobile ? '0.75rem' : '0.75rem',
                                            color: 'var(--text-muted)',
                                            fontFamily: 'monospace',
                                            fontWeight: isMobile ? '600' : '400'
                                        }}>
                                            {isMobile ? hour.toString() : `${hour.toString().padStart(2, '0')}:00`}
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
                            {weekDays.map((d, index) => {
                                const dateStr = d.toISOString().split('T')[0];
                                const isToday = new Date().toISOString().split('T')[0] === dateStr;
                                const dayEvents = displayedEvents.filter(e => e.start.startsWith(dateStr));

                                return (
                                    <div
                                        key={d.toString()}
                                        id={`schedule-col-${index}`} // ADDED ID for scrolling
                                        style={{
                                            ...columnStyle,
                                            scrollSnapAlign: 'start',
                                            borderRight: '1px solid var(--border-color)',
                                            position: 'relative',
                                            background: isToday ? 'rgba(76, 175, 80, 0.05)' : 'transparent',
                                            height: `${TOTAL_HEIGHT}px`
                                        }}>
                                        {/* Current Time Line */}
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
                                                        pointerEvents: 'none',
                                                        opacity: 0.8
                                                    }}>
                                                        <div style={{ position: 'absolute', left: '-4px', top: '-4px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)' }}></div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}

                                        {/* Events with Layout Logic */}
                                        {(() => {
                                            // 1. Prepare events with positioning data
                                            const preparedEvents = dayEvents.map(event => {
                                                const start = new Date(event.start);
                                                const end = new Date(event.end);
                                                const startOfDayMinutes = start.getHours() * 60 + start.getMinutes();
                                                const startViewMinutes = START_HOUR * 60;
                                                const topPx = (startOfDayMinutes - startViewMinutes) * (HOUR_HEIGHT / 60);
                                                const durationMinutes = (end - start) / (1000 * 60);
                                                const heightPx = Math.max(durationMinutes * (HOUR_HEIGHT / 60), 30);

                                                return {
                                                    event,
                                                    start,
                                                    end,
                                                    startMs: start.getTime(),
                                                    endMs: end.getTime(),
                                                    topPx,
                                                    heightPx
                                                };
                                            }).filter(e => e.topPx + e.heightPx >= 0 && e.topPx <= TOTAL_HEIGHT)
                                                .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs); // Sort by start, then longest first

                                            // 2. Group into visual clusters
                                            const clusters = [];
                                            let currentCluster = [];
                                            let clusterEnd = 0;

                                            preparedEvents.forEach(node => {
                                                if (currentCluster.length === 0) {
                                                    currentCluster.push(node);
                                                    clusterEnd = node.endMs;
                                                } else {
                                                    // If this event starts after the entire current cluster finishes, start a new cluster
                                                    if (node.startMs >= clusterEnd) {
                                                        clusters.push(currentCluster);
                                                        currentCluster = [node];
                                                        clusterEnd = node.endMs;
                                                    } else {
                                                        currentCluster.push(node);
                                                        clusterEnd = Math.max(clusterEnd, node.endMs);
                                                    }
                                                }
                                            });
                                            if (currentCluster.length > 0) clusters.push(currentCluster);

                                            // 3. Render each cluster
                                            return clusters.flatMap(cluster => {
                                                // Pack events into columns within the cluster
                                                const columns = []; // Array of arrays (each representing a column)

                                                cluster.forEach(node => {
                                                    let placed = false;
                                                    for (let i = 0; i < columns.length; i++) {
                                                        const lastInCol = columns[i][columns[i].length - 1];
                                                        if (node.startMs >= lastInCol.endMs) {
                                                            columns[i].push(node);
                                                            node.colIndex = i;
                                                            placed = true;
                                                            break;
                                                        }
                                                    }
                                                    if (!placed) {
                                                        columns.push([node]);
                                                        node.colIndex = columns.length - 1;
                                                    }
                                                });

                                                const numCols = columns.length;

                                                return cluster.map(node => {
                                                    const { event, start, end, topPx, heightPx, colIndex } = node;
                                                    const bgColor = getSubjectColor(event.summary);

                                                    // Calculate width and left position
                                                    const widthPercent = 100 / numCols;
                                                    const leftPercent = colIndex * widthPercent;

                                                    return (
                                                        <div
                                                            key={event.uid}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${topPx}px`,
                                                                left: `${leftPercent}%`,
                                                                width: `${widthPercent}%`, // Use calculated width
                                                                height: `${heightPx}px`,
                                                                padding: '4px', // Reduced padding slightly for tighter fit
                                                                fontSize: numCols > 2 ? '0.7rem' : '0.8rem', // Scale down text if crowded
                                                                borderRadius: '2px',
                                                                zIndex: 10 + colIndex, // Slight z-index for hover fix if needed, but safe layout shouldn't overlap
                                                                background: bgColor,
                                                                borderLeft: `3px solid ${studentColor}`,
                                                                border: '1px solid rgba(0,0,0,0.05)',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                                                color: '#2c3e50',
                                                                overflow: 'hidden',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                lineHeight: '1.2'
                                                            }}
                                                        >
                                                            <div style={{ fontWeight: '700', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {event.summary.replace(new RegExp(`^${selectedStudent}:?\\s*`, 'i'), '')}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                {!isMobile && numCols < 3 && ` - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                                            </div>
                                                            {event.location && !isMobile && numCols < 3 && (
                                                                <div style={{ fontSize: '0.75rem', marginTop: '2px', fontStyle: 'italic', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {event.location}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            });
                                        })()}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleViewer;
