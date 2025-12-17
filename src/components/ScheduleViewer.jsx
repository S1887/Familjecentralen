
import React, { useState, useMemo, useRef } from 'react';

const ScheduleViewer = ({ events }) => {
    const [selectedStudent, setSelectedStudent] = useState('Algot');
    const [weekOffset, setWeekOffset] = useState(0);
    const scrollRef = useRef(null);

    // Student colors
    const studentColors = {
        'Algot': '#3498db',
        'Tuva': '#9b59b6'
    };

    const studentColor = studentColors[selectedStudent] || '#646cff';

    // Subject colors for lessons
    const getSubjectColor = (summary) => {
        const subjectLower = (summary || '').toLowerCase();

        if (subjectLower.includes('svenska')) return '#f1c40f'; // Gult
        if (subjectLower.includes('matematik') || subjectLower.includes('matte')) return '#3498db'; // Blått
        if (subjectLower.includes('engelska')) return '#e74c3c'; // Rött
        if (subjectLower.includes('samhällo') || subjectLower.includes('so')) return '#8b4513'; // Brun
        if (subjectLower.includes('natur') || subjectLower.includes('no') || subjectLower.includes('biologi')) return '#27ae60'; // Grön
        if (subjectLower.includes('idrott') || subjectLower.includes('gympa')) return '#ff69b4'; // Rosa
        if (subjectLower.includes('slöjd') || subjectLower.includes('trä')) return '#ecf0f1'; // Vit/ljusgrå
        if (subjectLower.includes('musik')) return '#e67e22'; // Orange
        if (subjectLower.includes('bild') || subjectLower.includes('konst')) return '#9b59b6'; // Lila
        if (subjectLower.includes('teknik')) return '#95a5a6'; // Grå

        return '#444'; // Default grå
    };

    // Filter events for the schedule
    const scheduleEvents = useMemo(() => {
        return events.filter(e => {
            if (!e.isLesson) return false;
            if (e.student !== selectedStudent) return false;
            return true;
        });
    }, [events, selectedStudent]);

    // Helper to get week's dates based on offset
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

    // Get ISO week number
    const getWeekNumber = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };

    const weekDays = getWeekDays(weekOffset);
    const weekNumber = getWeekNumber(weekDays[0]);

    // Helper to format time
    const formatTime = (isoString) => {
        const d = new Date(isoString);
        return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    };

    // Check if mobile
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    return (
        <div className="schedule-viewer-container">
            <div className="schedule-header">
                <h3>Skolschema</h3>
                <div className="student-selector">
                    <button
                        className={selectedStudent === 'Algot' ? 'active' : ''}
                        onClick={() => setSelectedStudent('Algot')}
                        style={{
                            background: selectedStudent === 'Algot' ? 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)' : '#333',
                            color: selectedStudent === 'Algot' ? 'white' : '#888',
                            border: selectedStudent === 'Algot' ? 'none' : '1px solid #444'
                        }}
                    >
                        Algot
                    </button>
                    <button
                        className={selectedStudent === 'Tuva' ? 'active' : ''}
                        onClick={() => setSelectedStudent('Tuva')}
                        style={{
                            background: selectedStudent === 'Tuva' ? 'linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)' : '#333',
                            color: selectedStudent === 'Tuva' ? 'white' : '#888',
                            border: selectedStudent === 'Tuva' ? 'none' : '1px solid #444'
                        }}
                    >
                        Tuva
                    </button>
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
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '1.2rem'
                    }}
                >
                    ◀
                </button>
                <span style={{
                    fontWeight: 'bold',
                    fontSize: '1.1rem',
                    minWidth: '120px',
                    textAlign: 'center',
                    color: 'white'
                }}>
                    Vecka {weekNumber}
                </span>
                <button
                    onClick={() => setWeekOffset(weekOffset + 1)}
                    style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '1.2rem'
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
                            color: '#646cff',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        Idag
                    </button>
                )}
            </div>

            {/* Schedule Grid - Horizontal scroll on mobile */}
            <div
                ref={scrollRef}
                className="schedule-grid"
                style={{
                    display: 'flex',
                    gap: '10px',
                    overflowX: 'auto',
                    scrollSnapType: 'x mandatory',
                    WebkitOverflowScrolling: 'touch',
                    paddingBottom: '1rem'
                }}
            >
                {weekDays.map((day, index) => {
                    const dayName = day.toLocaleDateString('sv-SE', { weekday: 'short' });
                    const dateStr = day.toISOString().split('T')[0];
                    const dayEvents = scheduleEvents.filter(e => e.start.startsWith(dateStr));
                    dayEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
                    const isToday = new Date().toISOString().split('T')[0] === dateStr;

                    return (
                        <div
                            key={index}
                            className={`schedule-day-column ${isToday ? 'today' : ''}`}
                            style={{
                                flex: isMobile ? '0 0 calc(33.333% - 7px)' : '1',
                                minWidth: isMobile ? 'calc(33.333% - 7px)' : '140px',
                                scrollSnapAlign: 'start',
                                background: '#2a2a2a',
                                borderRadius: '8px'
                            }}
                        >
                            <div
                                className="day-header"
                                style={{
                                    background: isToday ? studentColor : 'transparent',
                                    color: isToday ? 'white' : '#eee',
                                    padding: '8px',
                                    textAlign: 'center',
                                    borderRadius: '8px 8px 0 0',
                                    borderBottom: isToday ? 'none' : '1px solid #444'
                                }}
                            >
                                <div className="day-name" style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{dayName}</div>
                                <div className="day-date" style={{ fontSize: '0.8em', color: isToday ? 'rgba(255,255,255,0.8)' : '#aaa' }}>
                                    {day.getDate()}/{day.getMonth() + 1}
                                </div>
                            </div>
                            <div className="day-events" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {dayEvents.length === 0 ? (
                                    <div className="no-school" style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', padding: '20px 0' }}>Ledig?</div>
                                ) : (
                                    dayEvents.map(ev => (
                                        <div
                                            key={ev.uid}
                                            className="schedule-card"
                                            style={{
                                                background: getSubjectColor(ev.summary),
                                                padding: isMobile ? '6px' : '8px',
                                                borderRadius: '4px',
                                                fontSize: isMobile ? '0.75em' : '0.9em',
                                                borderLeft: `4px solid ${studentColor}`,
                                                wordBreak: 'break-word',
                                                color: getSubjectColor(ev.summary) === '#ecf0f1' ? '#333' : '#fff' // Dark text for white/light gray background
                                            }}
                                        >
                                            <div className="time" style={{ fontSize: isMobile ? '0.7em' : '0.8em', color: getSubjectColor(ev.summary) === '#ecf0f1' ? '#666' : '#ddd', marginBottom: '2px' }}>
                                                {formatTime(ev.start)}
                                            </div>
                                            <div className="subject" style={{ fontWeight: 'bold', color: getSubjectColor(ev.summary) === '#ecf0f1' ? '#333' : '#fff', fontSize: isMobile ? '0.85em' : '1em', lineHeight: '1.2' }}>{ev.summary}</div>
                                            {!isMobile && <div className="location" style={{ fontSize: '0.75em', color: getSubjectColor(ev.summary) === '#ecf0f1' ? '#666' : '#bbb', marginTop: '4px' }}>{ev.location}</div>}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ScheduleViewer;


