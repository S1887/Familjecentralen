import React, { useState, useEffect } from 'react';
import Icon from './Icon';

// Hero image is served from HA's /config folder via API
const getHeroImageUrl = () => {
    // Works in both direct access and HA Ingress contexts
    const pathname = window.location.pathname;
    if (pathname.includes('ingress') || pathname.includes('hassio')) {
        const basePath = pathname.replace(/\/+$/, '');
        return basePath + '/api/hero-image';
    }
    return '/api/hero-image';
};

const NAME_COLORS = {
    'Svante': '#e67c73', // Red
    'Sarah': '#f6bf26', // Yellow
    'Algot': '#4285f4', // Blue
    'Tuva': '#9c27b0', // Purple
    'Leon': '#33b679'  // Green
};

const capitalizeFirst = (str) => str.charAt(0).toUpperCase() + str.slice(1);

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

// Card component moved outside to prevent re-creation on each render
const Card = ({ children, onClick, style, className, theme, darkMode, onTouchStart, onTouchMove, onTouchEnd }) => (
    <div
        onClick={onClick}
        className={className}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
            background: theme.cardBg,
            borderRadius: '24px',
            padding: '1.2rem',
            cursor: onClick ? 'pointer' : 'default',
            boxShadow: darkMode ? '0 4px 6px rgba(0,0,0,0.1)' : '0 10px 20px rgba(0,0,0,0.1)',
            border: darkMode ? '1px solid rgba(255,255,255,0.05)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'transform 0.2s ease, background 0.2s',
            color: theme.cardText,
            overflow: 'hidden',
            position: 'relative',
            ...style
        }}
        onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'scale(1.02)'; }}
        onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = 'scale(1)'; }}
    >
        {children}
    </div>
);

const NewHome = ({ user, weather, events, tasks, setActiveTab, onOpenModal: _onOpenModal, setSelectedDate, setViewMode, holidays, onOpenEventDetail, onOpenMatchModal, onDayClick, darkMode }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [dayOffset, setDayOffset] = useState(0);
    const [touchStart, setTouchStart] = useState(0);
    const [touchEnd, setTouchEnd] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Swipe handlers for day navigation
    const handleTouchStart = (e) => {
        setTouchStart(e.targetTouches[0].clientX);
        setTouchEnd(e.targetTouches[0].clientX);
    };
    const handleTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };
    const handleTouchEnd = () => {
        if (touchStart - touchEnd > 75) {
            setDayOffset(d => d + 1); // Swipe left → next day
        }
        if (touchStart - touchEnd < -75) {
            setDayOffset(d => d - 1); // Swipe right → previous day
        }
    };

    // Build date label for the events card header
    const getDateLabel = (offset) => {
        if (offset === 0) return 'Dagens händelser';
        if (offset === 1) return 'Imorgon';
        if (offset === -1) return 'Igår';
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return capitalizeFirst(d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }));
    };

    // Filter next upcoming event
    const now = new Date();
    const viewDate = new Date(now);
    viewDate.setDate(viewDate.getDate() + dayOffset);
    const viewDayStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());
    const viewDayEnd = new Date(viewDayStart);
    viewDayEnd.setDate(viewDayEnd.getDate() + 1);

    // Keep todayStart/todayEnd for other uses (upcoming events etc.)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Get events for the viewed day (including multi-day events that span it)
    const todaysEvents = events
        .filter(e => {
            const eventStart = new Date(e.start);
            let eventEnd = new Date(e.end);

            // All-day events in ICS/Google have exclusive end dates (midnight next day)
            // Adjust to 23:59:59 of the previous day for correct display
            if (eventEnd.getHours() === 0 && eventEnd.getMinutes() === 0) {
                eventEnd = new Date(eventEnd.getTime() - 1);
            }

            // Event spans viewed day if: starts before day ends AND ends after day starts
            return eventStart < viewDayEnd && eventEnd > viewDayStart;
        })
        .sort((a, b) => {
            const startDiff = new Date(a.start) - new Date(b.start);
            if (startDiff !== 0) return startDiff;
            return new Date(a.end) - new Date(b.end);
        });

    const upcomingEvents = events
        .filter(e => new Date(e.start) > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start));

    const _nextEvent = upcomingEvents[0];

    // Get weather
    const getWeatherIcon = (code, isDay = 1) => {
        if (code === 0) return isDay ? '☀️' : '🌙';
        if (code >= 1 && code <= 3) return isDay ? '⛅' : '☁️';
        if (code >= 45 && code <= 48) return '🌫️';
        if (code >= 51 && code <= 67) return '🌧️';
        if (code >= 71 && code <= 77) return '❄️';
        if (code >= 95) return '⚡';
        return isDay ? '🌤️' : '☁️';
    };

    const getCurrentWeather = () => {
        if (!weather || !weather.current) return null;
        return {
            temp: Math.round(weather.current.temperature_2m),
            code: weather.current.weather_code,
            wind: weather.current.wind_speed_10m,
            icon: getWeatherIcon(weather.current.weather_code, weather.current.is_day)
        };
    };
    const currentWeather = getCurrentWeather();

    // Theme Colors - Hardcoded for reliability (CSS variables didn't work well here)
    const theme = darkMode ? {
        // Dark Mode - Spotify-style
        bgOverlay: 'linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.85))',
        cardBg: 'rgba(28, 28, 28, 0.8)', // 20% transparency test
        cardBgHighlight: '#333333',
        accent: '#2ed573', // Flat Green
        textMain: '#ffffff',
        cardText: '#ffffff',
        textMuted: '#b3b3b3',
        success: '#2ed573', // Flat Green
        warning: '#ffa502', // Flat Orange
        weatherWidgetBg: 'rgba(255,255,255,0.08)',
        weatherWidgetBorder: 'rgba(255,255,255,0.1)',
        nextEventBg: 'rgba(28, 28, 28, 0.8)', // Made flat dark to match other cards
        textColorInverse: '#000'
    } : {
        // Light Mode - Clean
        bgOverlay: 'none',
        cardBg: '#ffffff',
        cardBgHighlight: '#f8f9fa',
        accent: '#2ed573', // Flat Green
        textMain: '#2d3436',
        cardText: '#2d3436',
        textMuted: '#636e72',
        success: '#2ed573', // Flat Green
        warning: '#ffa502', // Flat Orange
        weatherWidgetBg: 'rgba(255,255,255,0.8)',
        weatherWidgetBorder: 'rgba(0,0,0,0.1)',
        nextEventBg: '#ffffff',
        textColorInverse: '#fff'
    };

    return (
        <>


            {/* Fixed Background Layer */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                backgroundImage: `linear-gradient(${darkMode ? 'rgba(0,0,0,0.65), rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.70), rgba(255,255,255,0.80)'}), url(${getHeroImageUrl()})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                pointerEvents: 'none'
            }} />

            {/* Content Container */}
            <div style={{
                minHeight: '100vh',
                color: theme.textMain,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                padding: '2rem 0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                width: '100%',
                position: 'relative',
                zIndex: 1,
                boxSizing: 'border-box'
            }}>

                <div className="new-home-container">

                    {/* Top Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '400', opacity: 0.9 }}>Hej {user.name}!</h1>
                            <div style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.2rem', color: theme.textMuted }}>
                                {capitalizeFirst(currentTime.toLocaleDateString('sv-SE', { weekday: 'long' }))} {currentTime.getDate()} {currentTime.toLocaleDateString('sv-SE', { month: 'long' })}
                                {holidays && holidays.some(h => {
                                    const d = new Date(h.start);
                                    return d.getDate() === currentTime.getDate() && d.getMonth() === currentTime.getMonth();
                                }) && (
                                        <span style={{ color: theme.warning, marginLeft: '0.5rem', fontWeight: 'bold' }}>
                                            • {holidays.find(h => {
                                                const d = new Date(h.start);
                                                return d.getDate() === currentTime.getDate() && d.getMonth() === currentTime.getMonth();
                                            }).summary}
                                        </span>
                                    )}
                            </div>
                        </div>
                        <div
                            onClick={() => {
                                try {
                                    // Open in parent/top window context to bypass ingress iframe restrictions
                                    window.top.open('https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/2-2703382/Sverige/V%C3%A4stra%20G%C3%B6talands%20l%C3%A4n/Lidk%C3%B6pings%20Kommun/Jakobstorp', '_blank');
                                } catch {
                                    // Fallback
                                    window.open('https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/2-2703382/Sverige/V%C3%A4stra%20G%C3%B6talands%20l%C3%A4n/Lidk%C3%B6pings%20Kommun/Jakobstorp', '_blank');
                                }
                            }}
                            style={{
                                background: theme.weatherWidgetBg,
                                border: `1px solid ${theme.weatherWidgetBorder}`,
                                borderRadius: '20px',
                                padding: '0.4rem 0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                backdropFilter: 'blur(10px)',
                                color: theme.textMain
                            }}
                            title="Gå till YR.no"
                        >
                            <span
                                style={{ fontSize: '1.2rem' }}
                            >
                                {currentWeather?.icon || '🌤️'}
                            </span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                                {currentWeather ? `${currentWeather.temp}°` : ''}
                            </span>
                            {currentWeather?.wind && (
                                <span style={{ fontSize: '0.8rem', opacity: 0.7, marginRight: '0.2rem' }}>
                                    {Math.round(currentWeather.wind)} m/s
                                </span>
                            )}
                            <span style={{ fontSize: '0.9rem', fontWeight: '600', opacity: 0.9 }}>
                                {currentTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>

                    {/* Main Grid */}
                    <div className="new-home-grid">

                        {/* 1. Today's Events - Spans Full Width */}
                        <Card theme={theme} darkMode={darkMode}
                            style={{ gridColumn: '1 / -1', minHeight: '120px', background: theme.nextEventBg, display: 'flex', flexDirection: 'column', touchAction: 'pan-y' }}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                        >
                            {dayOffset !== 0 && (
                                <div
                                    onClick={(e) => { e.stopPropagation(); setDayOffset(0); }}
                                    style={{
                                        fontSize: '1.2rem', color: theme.accent, cursor: 'pointer',
                                        padding: '0.2rem 0.5rem', borderRadius: '8px',
                                        transition: 'opacity 0.2s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        minWidth: '36px', minHeight: '36px',
                                        position: 'absolute', left: '0.4rem', top: '0.4rem', zIndex: 1
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                    title="Tillbaka till idag"
                                >↩</div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.8rem', gap: '0.2rem', flexWrap: 'nowrap' }}>
                                <div
                                    onClick={(e) => { e.stopPropagation(); setDayOffset(d => d - 1); }}
                                    style={{
                                        cursor: 'pointer', fontSize: '1.8rem', color: theme.textMuted,
                                        padding: '0.2rem 0.5rem', borderRadius: '8px', lineHeight: 0.9,
                                        transition: 'color 0.2s', minWidth: '44px', minHeight: '44px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, position: 'relative', top: '-2px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.color = theme.accent}
                                    onMouseLeave={e => e.currentTarget.style.color = theme.textMuted}
                                >‹</div>
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDate(new Date());
                                        setViewMode('upcoming');
                                        setActiveTab('timeline');
                                    }}
                                    style={{
                                        fontSize: '1.05rem',
                                        color: theme.accent,
                                        fontWeight: '700',
                                        textTransform: 'uppercase',
                                        letterSpacing: '1px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        transition: 'opacity 0.2s',
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                    title="Visa alla kommande händelser"
                                >
                                    {getDateLabel(dayOffset)}
                                </div>
                                <div
                                    onClick={(e) => { e.stopPropagation(); setDayOffset(d => d + 1); }}
                                    style={{
                                        cursor: 'pointer', fontSize: '1.8rem', color: theme.textMuted,
                                        padding: '0.2rem 0.5rem', borderRadius: '8px', lineHeight: 0.9,
                                        transition: 'color 0.2s', minWidth: '44px', minHeight: '44px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, position: 'relative', top: '-2px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.color = theme.accent}
                                    onMouseLeave={e => e.currentTarget.style.color = theme.textMuted}
                                >›</div>
                            </div>

                            <div style={{ flex: 1 }}>
                                {todaysEvents.length === 0 ? (
                                    <div style={{ fontSize: '1.1rem', color: theme.textMuted, fontStyle: 'italic', padding: '1rem 0' }}>
                                        {dayOffset === 0 ? 'Inga händelser idag. Njut av dagen! 🌟' : 'Inga händelser denna dag.'}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {todaysEvents.map((event, idx) => {
                                            const eventTime = new Date(event.start);
                                            const eventEndTime = event.end ? new Date(event.end) : null;
                                            const isPast = eventEndTime && eventEndTime < now;

                                            // Calculate multi-day info
                                            let multiDayLabel = null;
                                            if (isAllDayEvent(event)) {
                                                const evStart = new Date(event.start);
                                                evStart.setHours(0, 0, 0, 0);
                                                let evEnd = new Date(event.end || event.start);
                                                if (evEnd.getHours() === 0 && evEnd.getMinutes() === 0 && evEnd > evStart) {
                                                    evEnd = new Date(evEnd.getTime() - 1);
                                                }
                                                evEnd.setHours(0, 0, 0, 0);
                                                const totalDays = Math.round((evEnd - evStart) / (1000 * 60 * 60 * 24)) + 1;
                                                if (totalDays > 1) {
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    const dayNumber = Math.round((today - evStart) / (1000 * 60 * 60 * 24)) + 1;
                                                    multiDayLabel = `dag ${dayNumber}/${totalDays}`;
                                                }
                                            }

                                            return (
                                                <div
                                                    key={event.uid || idx}
                                                    onClick={() => onOpenEventDetail && onOpenEventDetail(event)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.8rem',
                                                        padding: '0.6rem 0.8rem',
                                                        background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                                        borderRadius: '12px',
                                                        cursor: 'pointer',
                                                        opacity: isPast ? 0.5 : 1,
                                                        transition: 'transform 0.15s ease, background 0.15s ease'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}
                                                >
                                                    {/* Time */}
                                                    <div style={{
                                                        minWidth: '50px',
                                                        fontWeight: '600',
                                                        fontSize: '0.95rem',
                                                        color: isPast ? theme.textMuted : theme.accent
                                                    }}>
                                                        {isAllDayEvent(event) ? (multiDayLabel ? `Heldag (${multiDayLabel})` : 'Heldag') : eventTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>

                                                    {/* Event Info */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            fontWeight: '500',
                                                            fontSize: '1rem',
                                                            color: theme.cardText,
                                                            textDecoration: isPast ? 'line-through' : 'none',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }}>
                                                            {isPast && <span style={{ color: theme.textMuted, marginRight: '0.3rem', fontSize: '0.8em' }}>✓</span>}
                                                            {event.summary}
                                                        </div>
                                                        {event.location && (
                                                            <div style={{
                                                                fontSize: '0.8rem',
                                                                color: theme.textMuted,
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis'
                                                            }}>
                                                                <Icon name="mapPin" size={16} style={{ color: '#ff7675', marginRight: '0.5rem' }} />
                                                                {event.location}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Assignees Badge */}
                                                    {event.assignees && event.assignees.length > 0 && (
                                                        <div style={{
                                                            fontSize: '0.75rem',
                                                            background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                                            padding: '0.2rem 0.5rem',
                                                            borderRadius: '8px',
                                                            color: theme.textMuted,
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {event.assignees.length === 1 ? event.assignees[0] : `${event.assignees.length} pers`}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* 2. Calendar Button */}
                        {/* 2. Calendar Button */}
                        {/* 2. Calendar Button */}
                        {/* 2. Calendar Button */}
                        <Card theme={theme} darkMode={darkMode} onClick={() => setActiveTab('timeline')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0.5rem' }}>
                            <div style={{ marginBottom: '0.5rem', color: '#4aa3df' }}>
                                {/* Calendar Icon */}
                                <Icon name="calendar" size={40} />
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>Kalender</div>
                        </Card>

                        {/* 3. Tasks Button */}
                        {/* 3. Tasks Button */}
                        <Card theme={theme} darkMode={darkMode} onClick={() => setActiveTab('todos')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0.5rem' }}>
                            <div style={{ marginBottom: '0.5rem', color: theme.success }}>
                                <Icon name="check" size={40} />
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>Att göra</div>

                            {(() => {
                                const pending = tasks.filter(t => !t.done);

                                if (pending.length === 0) {
                                    return (
                                        <div style={{ position: 'absolute', top: 'calc(50% + 40px)', left: 0, width: '100%', textAlign: 'center', fontSize: '0.65rem', color: theme.textMuted, opacity: 0.7 }}>
                                            Inga uppgifter
                                        </div>
                                    );
                                }

                                const visibleTasks = pending.slice(0, 2); // Show max 2 to keep it subtle
                                const hasMore = pending.length > 2;

                                return (
                                    <div style={{ position: 'absolute', top: 'calc(50% + 40px)', left: 0, width: '100%', padding: '0 0.5rem', display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center' }}>
                                        {visibleTasks.map((t, i) => {
                                            const assigneeColor = NAME_COLORS[t.assignee];
                                            return (
                                                <div key={i} style={{
                                                    fontSize: '0.7rem',
                                                    lineHeight: '1.2',
                                                    color: assigneeColor || theme.cardText,
                                                    maxWidth: '100%',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    opacity: 0.9,
                                                    fontWeight: assigneeColor ? '500' : '400'
                                                }}>
                                                    <span style={{ fontWeight: '600', marginRight: '3px' }}>
                                                        {t.assignee ? `${t.assignee}:` : ''}
                                                    </span>
                                                    {t.text}
                                                </div>
                                            );
                                        })}
                                        {hasMore && (
                                            <div style={{ fontSize: '0.6rem', color: theme.textMuted, lineHeight: '1' }}>
                                                + {pending.length - 2} till...
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </Card>

                        {/* 4. School Schedule Button */}
                        {/* 4. School Schedule Button - Hide for Leon */}
                        {/* 4. School Schedule Button */}
                        {/* 4. School Schedule Button */}
                        {user.name !== 'Leon' && (
                            <Card theme={theme} darkMode={darkMode} onClick={() => setActiveTab('schedule')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0.5rem' }}>
                                <div style={{ marginBottom: '0.5rem', color: '#ff9f43' }}>
                                    {/* School/Book Icon */}
                                    <Icon name="school" size={40} />
                                </div>
                                <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>Skolschema</div>
                            </Card>
                        )}

                        {/* 5.5. Next Match Card */}
                        {/* 5.5. Next Match Card */}
                        {/* 5.5. Next Match Card */}
                        {(() => {
                            const now = new Date();
                            const upcomingMatches = events
                                .filter(e => {
                                    const summary = (e.summary || '').toLowerCase();
                                    const source = e.source || '';
                                    const isArsenal = source.includes('Arsenal') || summary.includes('arsenal');
                                    const isOis = source.includes('Örgryte') || summary.includes('örgryte') || summary.includes('orgryte') || summary.includes('öis') || summary.includes('ois');
                                    return (isArsenal || isOis) && new Date(e.end || e.start) > now;
                                })
                                .sort((a, b) => new Date(a.start) - new Date(b.start));

                            const nextMatch = upcomingMatches[0];

                            // Always show card, determine team for logo
                            let isArsenal = false;
                            let cleanSummary = nextMatch ? nextMatch.summary.replace(/^[^:]+:\s*/, '') : 'Ingen kommande match';
                            let displayDate = nextMatch ? new Date(nextMatch.start) : null;

                            if (nextMatch) {
                                const source = (nextMatch.source || '').toLowerCase();
                                const summary = (nextMatch.summary || '').toLowerCase();
                                isArsenal = source.includes('arsenal') || summary.includes('arsenal');
                            }

                            return (
                                <Card theme={theme} darkMode={darkMode}
                                    onClick={onOpenMatchModal}
                                    style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0.5rem', background: theme.cardBg }}
                                >
                                    <div style={{ marginBottom: '0.5rem', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {isArsenal ? (
                                            <img src="https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg" alt="Arsenal" style={{ height: '100%', objectFit: 'contain' }} />
                                        ) : (
                                            <img src="./assets/ois-logo.png" alt="ÖIS" style={{ height: '100%', objectFit: 'contain' }} />
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                                        Nästa match
                                    </div>

                                    <div style={{ position: 'absolute', top: 'calc(50% + 40px)', left: 0, width: '100%', padding: '0 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.7rem', color: theme.textMuted, lineHeight: 1.2, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '500' }}>
                                            {cleanSummary}
                                        </div>
                                        {displayDate && (
                                            <div style={{ fontSize: '0.7rem', color: theme.textMuted, marginTop: '1px', fontWeight: '500' }}>
                                                {displayDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')} kl {displayDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            );
                        })()}





                        {/* 6. Cypressvägen 8 (Link) */}
                        {/* 6. Cypressvägen 8 (Link) */}
                        <Card theme={theme} darkMode={darkMode} onClick={() => window.location.href = 'https://icdyb1l1q3laawhz67o2dpgt9uczhgfe.ui.nabu.casa/lovelace/Oversikt'} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0.5rem' }}>
                            <div style={{ marginBottom: '0.5rem', color: '#e74c3c' }}>
                                {/* House Icon */}
                                <Icon name="home" size={40} />
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>Cypressvägen 8</div>
                        </Card>

                        {/* Meal Plan Card */}
                        <Card theme={theme} darkMode={darkMode} onClick={() => setActiveTab('matsedel')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0.5rem' }}>
                            <div style={{ marginBottom: '0.5rem', color: '#ff7675' }}>
                                <Icon name="utensils" size={40} />
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>Matsedel</div>
                        </Card>

                    </div>
                </div>
            </div >
        </>
    );
};

export default NewHome;
