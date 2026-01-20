import React, { useState } from 'react';
import { formatDuration } from '../mapService';
import Icon from './Icon';

// Helper to check if event is all-day (starts at 00:00 and ends at 00:00 or 23:59)
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

const EventDetailModal = ({ event, allEvents, onClose, onEdit, onNavigate, onShowAllUpcoming, onTrash, getGoogleCalendarLink, isAdmin }) => {
    // Hooks must be called unconditionally, before any early return
    const [touchStart, setTouchStart] = useState(0);
    const [touchEnd, setTouchEnd] = useState(0);

    if (!event) return null;

    // Sort events chronologically (upcoming only)
    const now = new Date();
    // Filter duplicates and sort

    const uniqueEvents = [...(allEvents || [])].reduce((acc, current) => {
        if (!current || !current.uid) return acc;
        const x = acc.find(item => item.uid === current.uid);
        if (!x) {
            return acc.concat([current]);
        } else {
            return acc;
        }
    }, []);

    const sortedEvents = uniqueEvents
        .filter(e => new Date(e.start) > now)
        .sort((a, b) => {
            const timeDiff = new Date(a.start) - new Date(b.start);
            if (timeDiff !== 0) return timeDiff;
            const summaryDiff = (a.summary || '').localeCompare(b.summary || '');
            if (summaryDiff !== 0) return summaryDiff;
            return a.uid.localeCompare(b.uid);
        });

    const currentIndex = sortedEvents.findIndex(e => e.uid === event.uid);
    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < sortedEvents.length - 1;

    const handlePrevious = () => {
        if (hasPrevious && onNavigate) {
            onNavigate(sortedEvents[currentIndex - 1]);
        }
    };

    const handleNext = () => {
        if (hasNext && onNavigate) {
            onNavigate(sortedEvents[currentIndex + 1]);
        }
    };

    const handleTouchStart = (e) => {
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (touchStart - touchEnd > 75) {
            // Swipe left → Next
            handleNext();
        }
        if (touchStart - touchEnd < -75) {
            // Swipe right → Previous
            handlePrevious();
        }
    };

    const eventDate = new Date(event.start);

    const eventEnd = new Date(event.end);

    if (isNaN(eventDate.getTime())) return null;

    const formatDate = (date) => {
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        return date.toLocaleDateString('sv-SE', options);
    };

    const getAssignedColorClass = (event) => {
        const summary = (event.summary || '').toLowerCase();
        const assignees = event.assignees || [];
        const assigneesLower = assignees.map(a => a.toLowerCase()).join(' ');

        if (assigneesLower.includes('algot')) return '#feca57';
        if (assigneesLower.includes('leon')) return '#ff6b6b';
        if (assigneesLower.includes('tuva')) return '#48dbfb';
        if (assigneesLower.includes('svante')) return '#ff9ff3';
        if (assigneesLower.includes('sarah')) return '#54a0ff';

        if (summary.includes('algot')) return '#feca57';
        if (summary.includes('leon')) return '#ff6b6b';
        if (summary.includes('tuva')) return '#48dbfb';

        return '#74b9ff';
    };

    const accentColor = getAssignedColorClass(event);

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
                    border: `2px solid ${accentColor}40`
                }}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'white',
                        fontSize: '1.5rem',
                        zIndex: 10,
                        transition: 'transform 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <Icon name="x" size={20} />
                </button>

                {/* Content */}
                <div style={{ padding: '2rem' }}>
                    {/* Title */}
                    <h1 style={{
                        margin: '0 0 1.5rem 0',
                        fontSize: '2rem',
                        fontWeight: '700',
                        color: 'white',
                        lineHeight: 1.2,
                        paddingRight: '40px'
                    }}>
                        {event.summary}
                    </h1>

                    {/* Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                        {/* Date */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                            <Icon name="calendar" size={24} />
                            <span style={{ color: 'rgba(255, 255, 255, 0.9)', textTransform: 'capitalize' }}>
                                {formatDate(eventDate)}
                            </span>
                        </div>

                        {/* Time */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                            <Icon name="clock" size={24} />
                            <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                {isAllDayEvent(event) ? 'Heldag' : `${eventDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} - ${eventEnd.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`}
                            </span>
                        </div>

                        {/* Location */}
                        {event.location && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                                <Icon name="mapPin" size={24} style={{ color: '#ff7675' }} />
                                <span style={{ color: accentColor, fontWeight: '500' }}>
                                    {event.location}
                                </span>
                            </div>
                        )}

                        {/* Travel Time */}
                        {event.travelTime && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                                <Icon name="car" size={24} style={{ color: '#74b9ff' }} />
                                <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                    {formatDuration(event.travelTime.duration)} ({Math.round(event.travelTime.distance / 1000)} km)
                                </span>
                            </div>
                        )}

                        {/* Assignees */}
                        {event.assignees && event.assignees.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                                <Icon name="users" size={24} />
                                <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                    {event.assignees.join(', ')}
                                </span>
                            </div>
                        )}

                        {/* Category */}
                        {event.category && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                                <Icon name="folder" size={24} />
                                <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                    {event.category}
                                </span>
                            </div>
                        )}

                        {/* Assignments */}
                        {event.assignments && (event.assignments.driver || event.assignments.packer) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {event.assignments.driver && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}>
                                        <Icon name="car" size={20} style={{ color: '#74b9ff' }} />
                                        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                            <strong>{event.assignments.driver}</strong> kör
                                        </span>
                                    </div>
                                )}
                                {event.assignments.packer && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem' }}>
                                        <Icon name="backpack" size={20} style={{ color: '#a29bfe' }} />
                                        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                                            <strong>{event.assignments.packer}</strong> packar
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    {event.description && (
                        <div style={{
                            background: 'rgba(0, 0, 0, 0.2)',
                            padding: '1rem',
                            borderRadius: '12px',
                            marginBottom: '1.5rem',
                            borderLeft: `4px solid ${accentColor}`
                        }}>
                            <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                {event.description}
                            </p>
                        </div>
                    )}

                    {/* Todo List */}
                    {event.todoList && event.todoList.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.75rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Icon name="check" size={20} /> Att göra
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {event.todoList.map((todo) => (
                                    <div key={todo.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem',
                                        background: 'rgba(0, 0, 0, 0.2)',
                                        borderRadius: '8px'
                                    }}>
                                        <span style={{ fontSize: '1.2rem' }}>
                                            {todo.done ? <Icon name="check" size={16} /> : ''}
                                        </span>
                                        <span style={{
                                            color: 'rgba(255, 255, 255, 0.9)',
                                            textDecoration: todo.done ? 'line-through' : 'none',
                                            opacity: todo.done ? 0.6 : 1
                                        }}>
                                            {todo.text}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => {
                                onClose();
                                setTimeout(() => onEdit(event), 100);
                            }}
                            style={{
                                flex: 1,
                                padding: '0.75rem 1.5rem',
                                background: accentColor,
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'transform 0.2s, filter 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <Icon name="edit" size={16} style={{ color: '#646cff', marginRight: '0.5rem' }} />
                            Redigera
                        </button>

                        {getGoogleCalendarLink && event.source && (event.source.includes('Svante') || event.source.includes('Sarah') || event.source.includes('Familjen')) && (
                            <a
                                href={getGoogleCalendarLink(event)}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    flex: 1,
                                    padding: '0.75rem 1.5rem',
                                    background: '#4285f4',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    textAlign: 'center',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Icon name="calendar" size={16} /> Google Kalender
                            </a>
                        )}

                        {/* "Ej aktuell" button - only for subscription events AND admin users */}
                        {onTrash && isAdmin && (() => {
                            const source = event.source || '';
                            const isOwnGoogleCalendar = source.includes('Svante') || source.includes('Sarah') || source.includes('Familjen') || source.includes('Örtendahls');
                            const isSubscription = !isOwnGoogleCalendar && (
                                source.includes('Villa') || source.includes('Råda') || source.includes('HK Lidköping') ||
                                source.includes('Lidköping') || source.includes('Arsenal') || source.includes('ÖIS') ||
                                source.includes('Örgryte') || source.includes('Vklass') || source.includes('Sportadmin') ||
                                source.includes('Laget') || event.isExternalSource || source.includes('Helgdag')
                            );

                            if (!isSubscription) return null;

                            return (
                                <button
                                    onClick={() => {
                                        if (window.confirm(`Markera "${event.summary}" som ej aktuell?\nEventet döljs från kalendern.`)) {
                                            onTrash(event);
                                            // Modal closes in App.jsx after API success
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem 1.5rem',
                                        background: '#ffa502',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontSize: '1rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s, filter 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    <Icon name="ban" size={16} style={{ marginRight: '0.3rem' }} /> Ej aktuell
                                </button>
                            );
                        })()}
                    </div>

                    {/* Navigation */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 'auto',
                        paddingTop: '2rem',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <button
                            onClick={handlePrevious}
                            disabled={!hasPrevious}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: hasPrevious ? accentColor : 'rgba(255, 255, 255, 0.05)',
                                color: hasPrevious ? 'white' : 'rgba(255, 255, 255, 0.3)',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: hasPrevious ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s',
                                opacity: hasPrevious ? 1 : 0.5
                            }}
                        >
                            ← Föregående
                        </button>

                        <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9rem' }}>
                            {currentIndex + 1} / {sortedEvents.length}
                        </div>

                        <button
                            onClick={handleNext}
                            disabled={!hasNext}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: hasNext ? accentColor : 'rgba(255, 255, 255, 0.05)',
                                color: hasNext ? 'white' : 'rgba(255, 255, 255, 0.3)',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: hasNext ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s',
                                opacity: hasNext ? 1 : 0.5
                            }}
                        >
                            Nästa →
                        </button>
                    </div>

                    {/* Show All Upcoming Button */}
                    {onShowAllUpcoming && (
                        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={onShowAllUpcoming}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    borderRadius: '12px',
                                    padding: '0.75rem 1.5rem',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                    e.currentTarget.style.color = 'white';
                                    e.currentTarget.style.borderColor = 'white';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                                }}
                            >
                                📅 Se alla kommande händelser
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EventDetailModal;
