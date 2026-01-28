import React, { useState } from 'react';
import './MobileGridWeekView.css';

const MobileGridWeekView = ({
    selectedDate,
    filteredEventsList,
    isSameDay,
    getEventColorClass,
    openEditModal,
    isAllDayEvent,
    onDayClick,
    onSwipe,
    newEventUids // V6.0 Prop
}) => {
    // Swipe State
    const [touchStart, setTouchStart] = useState(0);
    const [touchEnd, setTouchEnd] = useState(0);

    const handleTouchStart = (e) => {
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (!onSwipe) return;

        const distance = touchStart - touchEnd;
        const minSwipeDistance = 75;

        // Ensure touchEnd was actually set (meaning a move occurred)
        if (touchEnd === 0) return;

        if (distance > minSwipeDistance) {
            // Swipe Left -> Next Week
            onSwipe(1);
        }

        if (distance < -minSwipeDistance) {
            // Swipe Right -> Previous Week
            onSwipe(-1);
        }

        // Reset
        setTouchStart(0);
        setTouchEnd(0);
    };

    // Generate dates for the week (Monday -> Sunday)
    const getDaysOfWeek = (date) => {
        const current = new Date(date);
        const day = current.getDay();
        const diff = current.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

        const monday = new Date(current.setDate(diff));
        const days = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            days.push(d);
        }
        return days;
    };

    const weekDays = getDaysOfWeek(selectedDate);
    const today = new Date();

    const formatDate = (date) => {
        // Short day name: "mån", "tis"
        return new Intl.DateTimeFormat('sv-SE', { weekday: 'short' }).format(date).replace('.', '');
    };

    const formatDayNumber = (date) => {
        return date.getDate();
    };

    // Check if event spans a given day (for multi-day events)
    const isEventOnDay = (event, targetDay) => {
        const dayStart = new Date(targetDay);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDay);
        dayEnd.setHours(23, 59, 59, 999);

        const eventStart = new Date(event.start);
        let eventEnd = new Date(event.end);

        // All-day events in ICS/Google have exclusive end dates (midnight next day)
        // Adjust to 23:59:59 of the previous day for correct display
        if (eventEnd.getHours() === 0 && eventEnd.getMinutes() === 0) {
            eventEnd = new Date(eventEnd.getTime() - 1); // 23:59:59.999 previous day
        }

        // Event spans this day if: starts before day ends AND ends after day starts
        return eventStart <= dayEnd && eventEnd >= dayStart;
    };

    const getDayEvents = (day) => {
        return filteredEventsList.filter(event => isEventOnDay(event, day));
    };

    const formatMonthName = (date) => {
        return new Intl.DateTimeFormat('sv-SE', { month: 'short' }).format(date).replace('.', '').toUpperCase();
    };

    return (
        <div
            className="mobile-grid-week-container"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {weekDays.map((day) => {
                const isToday = isSameDay(day, today);
                const dayEvents = getDayEvents(day);

                return (
                    <div
                        key={day.toISOString()}
                        className={`mobile-day-card ${isToday ? 'is-today' : ''}`}
                    >
                        <div className="mobile-day-header"
                            onClick={() => onDayClick && onDayClick(day)}
                            style={{ cursor: onDayClick ? 'pointer' : 'default' }}
                        >
                            <span className="mobile-day-number">{formatDayNumber(day)}</span>
                            <span className="mobile-day-name">{formatDate(day)} / {formatMonthName(day)}</span>
                        </div>
                        <div className="mobile-day-events">
                            {dayEvents.map(event => {
                                const isAllDay = isAllDayEvent ? isAllDayEvent(event) : false;
                                const timeStr = isAllDay ? null : new Date(event.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                                const colorClass = getEventColorClass ? getEventColorClass(event) : '';
                                const isNew = newEventUids && newEventUids.has(event.uid);

                                return (
                                    <div
                                        key={event.uid}
                                        className={`mobile-event-compact ${colorClass}`}
                                        onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                                        style={{ border: isNew ? '1px solid #ff4757' : 'none' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            {isNew && <span style={{ color: '#ff4757', marginRight: '2px', fontWeight: 'bold', fontSize: '0.7em' }}>●</span>}
                                            {timeStr && <span className="event-time-compact">{timeStr}</span>}
                                        </div>
                                        <span className="event-summary-compact">{event.summary}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* Box 8: Mini Week View */}
            <div className="mobile-day-card mini-overview-card">
                <div className="mini-week-container">
                    <span className="mini-week-label">v.{getWeekNumber(selectedDate)}</span>
                    <div className="mini-week-grid">
                        {weekDays.map(day => {
                            const isToday = isSameDay(day, today);
                            const hasEvents = getDayEvents(day).length > 0;
                            const dayInitial = new Intl.DateTimeFormat('sv-SE', { weekday: 'narrow' }).format(day).toUpperCase();

                            return (
                                <div key={day.toISOString()} className={`mini-day-cell ${isToday ? 'current-day' : ''}`}>
                                    <span className="mini-day-initial">{dayInitial}</span>
                                    <span className="mini-day-number">{day.getDate()}</span>
                                    {hasEvents && <div className="mini-event-dot"></div>}
                                </div>
                            );
                        })}
                    </div>
                    <span className="mini-month-label">{selectedDate.toLocaleDateString('sv-SE', { month: 'short' }).toUpperCase().replace('.', '')}</span>
                </div>
            </div>
        </div>
    );
};

// Helper for week number
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

export default MobileGridWeekView;
