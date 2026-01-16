import React from 'react';
import './MobileGridWeekView.css';

const MobileGridWeekView = ({
    selectedDate,
    filteredEventsList,
    isSameDay,
    getEventColorClass,
    openEditModal
}) => {

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

    const getDayEvents = (day) => {
        return filteredEventsList.filter(event => isSameDay(new Date(event.start), day));
    };

    const formatMonthName = (date) => {
        return new Intl.DateTimeFormat('sv-SE', { month: 'short' }).format(date).replace('.', '').toUpperCase();
    };

    return (
        <div className="mobile-grid-week-container">
            {weekDays.map((day, index) => {
                const isToday = isSameDay(day, today);
                const dayEvents = getDayEvents(day);

                return (
                    <div
                        key={day.toISOString()}
                        className={`mobile-day-card ${isToday ? 'is-today' : ''}`}
                    >
                        <div className="mobile-day-header">
                            <span className="mobile-day-number">{formatDayNumber(day)}</span>
                            <span className="mobile-day-name">{formatDate(day)} / {formatMonthName(day)}</span>
                        </div>
                        <div className="mobile-day-events">
                            {dayEvents.map(event => {
                                const timeStr = new Date(event.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                                const colorClass = getEventColorClass ? getEventColorClass(event) : '';

                                return (
                                    <div
                                        key={event.uid}
                                        className={`mobile-event-compact ${colorClass}`}
                                        onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                                    >
                                        <span className="event-time-compact">{timeStr}</span>
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
