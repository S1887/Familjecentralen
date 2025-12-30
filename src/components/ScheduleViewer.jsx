
import React, { useState, useMemo, useRef } from 'react';

const ScheduleViewer = ({ events, initialStudent }) => {
    const validStudents = ['Algot', 'Tuva'];
    const startStudent = validStudents.includes(initialStudent) ? initialStudent : 'Algot';
    const [selectedStudent, setSelectedStudent] = useState(startStudent);

    React.useEffect(() => {
        if (validStudents.includes(initialStudent)) {
            setSelectedStudent(initialStudent);
        }
    }, [initialStudent]);

    const [weekOffset, setWeekOffset] = useState(0);
    const scrollRef = useRef(null);

    // Student colors
    const studentColors = {
        'Algot': '#89CFF0', // Pastel Blue
        'Tuva': '#DDA0DD'   // Plum/Pastel Purple
    };

    const studentColor = studentColors[selectedStudent] || '#A9A9A9'; // Pastel Grey default

    // Subject colors for lessons
    const getSubjectColor = (summary) => {
        const subjectLower = (summary || '').toLowerCase();

        if (subjectLower.includes('svenska')) return '#FDFD96'; // Pastel Yellow
        if (subjectLower.includes('matematik') || subjectLower.includes('matte')) return '#AEC6CF'; // Pastel Blue
        if (subjectLower.includes('engelska')) return '#FFB7B2'; // Pastel Red
        if (subjectLower.includes('samhällo') || subjectLower.includes('so')) return '#C3B1E1'; // Pastel Purple-ish
        if (subjectLower.includes('natur') || subjectLower.includes('no') || subjectLower.includes('biologi')) return '#B2F7EF'; // Pastel Teal/Green
        if (subjectLower.includes('idrott') || subjectLower.includes('gympa')) return '#FFDAC1'; // Peach/Pastel Pink
        if (subjectLower.includes('slöjd') || subjectLower.includes('trä')) return '#E2F0CB'; // Pastel Lime
        if (subjectLower.includes('musik')) return '#FFCCB6'; // Pastel Orange
        if (subjectLower.includes('bild') || subjectLower.includes('konst')) return '#E0BBE4'; // Pastel Lavender
        if (subjectLower.includes('teknik')) return '#D4D4D4'; // Pastel Grey

        return '#444'; // Default darker grey for contrast against light pastel text? No wait, background is pastel. Text needs to be dark.
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
            {/* Header: Flex Column to prevent overlap */}
            <div className="schedule-header" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.8rem', fontWeight: '400', margin: 0 }}>Skolschema</h3>
                <div className="student-selector" style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                    {['Algot', 'Tuva'].map(student => (
                        <button
                            key={student}
                            onClick={() => setSelectedStudent(student)}
                            style={{
                                background: selectedStudent === student
                                    ? (student === 'Algot' ? 'linear-gradient(135deg, #89CFF0 0%, #0077BE 100%)' : 'linear-gradient(135deg, #DDA0DD 0%, #800080 100%)')
                                    : 'var(--button-bg)',
                                color: 'white',
                                border: 'none',
                                padding: '0.8rem 2rem',
                                borderRadius: '24px',
                                fontSize: '1rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: selectedStudent === student ? 1 : 0.7,
                                transform: selectedStudent === student ? 'scale(1.05)' : 'scale(1)'
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
                    fontWeight: '500',
                    fontSize: '1.2rem',
                    minWidth: '120px',
                    textAlign: 'center',
                    color: 'var(--text-main)',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    padding: '0.5rem 1rem',
                    borderRadius: '16px'
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
                                background: 'var(--card-bg)',
                                borderRadius: '24px',
                                overflow: 'hidden'
                            }}
                        >
                            <div
                                className="day-header"
                                style={{
                                    background: isToday ? studentColor : 'transparent',
                                    color: isToday ? '#2c3e50' : 'var(--text-main)',
                                    padding: '8px',
                                    textAlign: 'center',
                                    borderRadius: '0',
                                    borderBottom: isToday ? 'none' : '1px solid var(--border-color)'
                                }}
                            >
                                <div className="day-name" style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{dayName}</div>
                                <div className="day-date" style={{ fontSize: '0.8em', color: isToday ? 'rgba(0,0,0,0.6)' : 'var(--text-muted)' }}>
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
                                                padding: isMobile ? '8px' : '12px',
                                                borderRadius: '16px',
                                                fontSize: isMobile ? '0.75em' : '0.9em',
                                                borderLeft: `4px solid ${studentColor}`,
                                                wordBreak: 'break-word',
                                                color: '#2c3e50', // Always dark text for pastel backgrounds
                                                boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                                            }}
                                        >
                                            <div className="time" style={{ fontSize: isMobile ? '0.7em' : '0.8em', color: '#555', marginBottom: '2px', fontWeight: '500' }}>
                                                {formatTime(ev.start)}
                                            </div>
                                            <div className="subject" style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: isMobile ? '0.85em' : '1em', lineHeight: '1.2' }}>{ev.summary}</div>
                                            {!isMobile && <div className="location" style={{ fontSize: '0.75em', color: '#666', marginTop: '4px' }}>{ev.location}</div>}
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


