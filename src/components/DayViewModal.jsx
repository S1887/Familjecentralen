import React, { useState } from 'react';
import Icon from './Icon';

// Helper to check if event is all-day
const isAllDayEvent = (event) => {
    if (event.allDay) return true;
    const start = new Date(event.start);
    const end = new Date(event.end);
    const startHour = start.getHours();
    const startMin = start.getMinutes();
    const endHour = end.getHours();
    const endMin = end.getMinutes();
    return startHour === 0 && startMin === 0 && ((endHour === 0 && endMin === 0) || (endHour === 23 && endMin === 59));
};

const DayViewModal = ({
    selectedDate,
    events,
    onClose,
    onEventClick,
    onNavigate,
    getEventColorClass,
    isSameDay
}) => {
    if (!selectedDate) return null;

    const [touchStart, setTouchStart] = useState(0);
    const [touchEnd, setTouchEnd] = useState(0);

    // Get week number
    const getWeekNumber = (d) => {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };

    // Filter events for this day
    const dayEvents = events
        .filter(e => isSameDay(new Date(e.start), selectedDate))
        .sort((a, b) => {
            const startDiff = new Date(a.start) - new Date(b.start);
            if (startDiff !== 0) return startDiff;
            return new Date(a.end) - new Date(b.end);
        });

    // Navigation handlers
    const handlePrevious = () => {
        const prevDay = new Date(selectedDate);
        prevDay.setDate(prevDay.getDate() - 1);
        onNavigate(prevDay);
    };

    const handleNext = () => {
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        onNavigate(nextDay);
    };

    // Touch gestures for swipe
    const handleTouchStart = (e) => {
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (touchStart - touchEnd > 75) {
            // Swipe left → Next day
            handleNext();
        }
        if (touchStart - touchEnd < -75) {
            // Swipe right → Previous day
            handlePrevious();
        }
    };

    // Format date
    const formatDate = (date) => {
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const formatted = date.toLocaleDateString('sv-SE', options);
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    };

    const today = new Date();
    const isToday = isSameDay(selectedDate, today);

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backdropFilter: 'blur(10px)'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'var(--modal-bg)',
                    borderRadius: '24px',
                    maxWidth: '600px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    position: 'relative',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                    border: isToday ? '2px solid #2ed573' : '2px solid rgba(255, 255, 255, 0.1)'
                }}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Close Button */}
                {/* Close Button - Matching EventDetailModal exactly */}
                {/* Header with Sticky Position */}
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid var(--border-color)',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--modal-bg)',
                    zIndex: 20,
                    borderRadius: '24px 24px 0 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {/* Top Row: Spacer - Title - Close Button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        {/* Spacer to balance Close Button for perfect centering */}
                        <div style={{ width: '40px' }} />

                        {/* Date Title */}
                        <div style={{ textAlign: 'center', flex: 1 }}>
                            <h1 style={{
                                margin: 0,
                                fontSize: '1.6rem',
                                fontWeight: '700',
                                color: 'var(--text-main)',
                                lineHeight: 1.2
                            }}>
                                {formatDate(selectedDate)}
                            </h1>
                            <div style={{
                                fontSize: '0.9rem',
                                color: 'var(--text-muted)',
                                marginTop: '0.25rem'
                            }}>
                                Vecka {getWeekNumber(selectedDate)}
                                {isToday && <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', fontWeight: 'bold' }}>• Idag</span>}
                            </div>
                        </div>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '0',
                                width: '40px',
                                height: '40px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                fontSize: '2rem',
                                fontWeight: '300',
                                lineHeight: '1',
                                transition: 'opacity 0.2s',
                                marginTop: '-0.5rem', // Slight adjustment to align with title baseline visual
                                marginRight: '-0.5rem' // Pull right slightly into padding
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            ×
                        </button>
                    </div>

                    {/* Navigation row with arrows and count */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem'
                    }}>
                        <button
                            onClick={handlePrevious}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '0.5rem',
                                color: 'var(--text-main)',
                                cursor: 'pointer',
                                fontSize: '1.5rem',
                                transition: 'opacity 0.2s',
                                lineHeight: '1'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.6'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            ←
                        </button>

                        <div style={{
                            background: 'rgba(46, 213, 115, 0.2)',
                            color: '#2ed573',
                            padding: '0.3rem 0.8rem',
                            borderRadius: '12px',
                            fontSize: '0.9rem',
                            fontWeight: 'bold'
                        }}>
                            {dayEvents.length} {dayEvents.length === 1 ? 'händelse' : 'händelser'}
                        </div>

                        <button
                            onClick={handleNext}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '0.5rem',
                                color: 'var(--text-main)',
                                cursor: 'pointer',
                                fontSize: '1.5rem',
                                transition: 'opacity 0.2s',
                                lineHeight: '1'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.6'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            →
                        </button>
                    </div>
                </div>

                {/* Event List */}
                <div style={{ padding: '1.5rem' }}>
                    {dayEvents.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '3rem 1rem',
                            color: 'var(--text-muted)'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📅</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: '500' }}>
                                Inga händelser denna dag
                            </div>
                            <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                Njut av ledigheten! 🌟
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {dayEvents.map((event, idx) => {
                                const eventTime = new Date(event.start);
                                const eventEndTime = event.end ? new Date(event.end) : null;
                                const isPast = eventEndTime && eventEndTime < new Date();
                                const colorClass = getEventColorClass ? getEventColorClass(event) : '';

                                // Get border color from CSS class
                                const getBorderColor = () => {
                                    if (colorClass.includes('svante')) return '#ff4757';
                                    if (colorClass.includes('sarah')) return '#f1c40f';
                                    if (colorClass.includes('algot')) return '#2e86de';
                                    if (colorClass.includes('tuva')) return '#a29bfe';
                                    if (colorClass.includes('leon')) return '#e67e22';
                                    return '#2ed573';
                                };

                                return (
                                    <div
                                        key={event.uid || idx}
                                        onClick={() => onEventClick && onEventClick(event)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            padding: '1rem',
                                            background: 'var(--card-bg)', // Use theme var
                                            borderRadius: '12px',
                                            borderLeft: `4px solid ${getBorderColor()}`,
                                            cursor: 'pointer',
                                            opacity: isPast ? 0.6 : 1,
                                            transition: 'all 0.2s ease',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                            e.currentTarget.style.transform = 'translateX(4px)';
                                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'var(--card-bg)';
                                            e.currentTarget.style.transform = 'translateX(0)';
                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                                        }}
                                    >
                                        {/* Time */}
                                        <div style={{
                                            minWidth: '60px',
                                            fontWeight: '700',
                                            fontSize: '1.1rem',
                                            color: isPast ? 'var(--text-muted)' : getBorderColor(),
                                            textAlign: 'center'
                                        }}>
                                            {isAllDayEvent(event) ? (
                                                <div style={{ fontSize: '0.8rem' }}>Heldag</div>
                                            ) : (
                                                eventTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
                                            )}
                                        </div>

                                        {/* Event Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontWeight: '600',
                                                fontSize: '1.05rem',
                                                color: 'var(--text-main)',
                                                textDecoration: isPast ? 'line-through' : 'none',
                                                marginBottom: '0.25rem'
                                            }}>
                                                {isPast && <span style={{ color: 'var(--text-muted)', marginRight: '0.3rem', fontSize: '0.8em' }}>✓</span>}
                                                {event.summary}
                                            </div>

                                            {/* Location */}
                                            {event.location && (
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    color: 'var(--text-muted)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    marginBottom: '0.25rem'
                                                }}>
                                                    <Icon name="mapPin" size={14} style={{ color: '#ff7675' }} />
                                                    {event.location}
                                                </div>
                                            )}

                                            {/* Assignees */}
                                            {event.assignees && event.assignees.length > 0 && (
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    color: 'var(--text-muted)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem'
                                                }}>
                                                    <Icon name="users" size={14} />
                                                    {event.assignees.join(', ')}
                                                </div>
                                            )}
                                        </div>

                                        {/* Arrow indicator */}
                                        <div style={{
                                            color: 'var(--text-muted)',
                                            fontSize: '1.2rem',
                                            opacity: 0.5
                                        }}>
                                            →
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.8rem',
                    borderTop: '1px solid var(--border-color)',
                    opacity: 0.7
                }}>
                    Swajpa för att byta dag • Klicka på en händelse för detaljer
                </div>
            </div>
        </div>
    );
};

export default DayViewModal;
