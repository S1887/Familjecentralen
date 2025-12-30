import React, { useState, useEffect } from 'react';
import { getTravelTime, formatDuration } from '../mapService';

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

const NewHome = ({ user, weather, events, tasks, setActiveTab, onOpenModal, setSelectedDate, setViewMode, holidays, onOpenEventDetail, onOpenMatchModal, darkMode }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Filter next upcoming event
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Get all today's events (including past ones)
    const todaysEvents = events
        .filter(e => {
            const eventDate = new Date(e.start);
            return eventDate >= todayStart && eventDate < todayEnd;
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));

    const upcomingEvents = events
        .filter(e => new Date(e.start) > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start));

    const nextEvent = upcomingEvents[0];

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
        cardBg: '#282828',
        cardBgHighlight: '#333333',
        accent: '#1DB954',
        textMain: '#ffffff',
        cardText: '#ffffff',
        textMuted: '#b3b3b3',
        success: '#2ed573',
        warning: '#ffa502',
        weatherWidgetBg: 'rgba(255,255,255,0.08)',
        weatherWidgetBorder: 'rgba(255,255,255,0.1)',
        nextEventBg: 'linear-gradient(135deg, #333333 0%, #282828 100%)',
        textColorInverse: '#000'
    } : {
        // Light Mode
        bgOverlay: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.7))',
        cardBg: '#ffffff',
        cardBgHighlight: '#f8f9fa',
        accent: '#1DB954',
        textMain: '#ffffff',
        cardText: '#2d3436',
        textMuted: '#636e72',
        success: '#00b894',
        warning: '#fdcb6e',
        weatherWidgetBg: 'rgba(255,255,255,0.9)',
        weatherWidgetBorder: 'rgba(0,0,0,0.1)',
        nextEventBg: 'linear-gradient(135deg, #ffffff 0%, #f1f2f6 100%)',
        textColorInverse: '#fff'
    };

    const Card = ({ children, onClick, style, className }) => (
        <div
            onClick={onClick}
            className={className}
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
                color: theme.cardText, // Use cardText instead of textMain
                ...style
            }}
            onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = 'scale(1)'; }}
        >
            {children}
        </div>
    );

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
                backgroundImage: `linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.8)), url(${getHeroImageUrl()})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                pointerEvents: 'none' // Ensure clicks pass through
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
                            <div style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.2rem', color: '#ecf0f1' }}>
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
                                } catch (e) {
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
                        <Card
                            style={{ gridColumn: '1 / -1', minHeight: '120px', maxHeight: '300px', background: theme.nextEventBg, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                <div style={{ fontSize: '0.9rem', color: theme.accent, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    Dagens händelser
                                </div>
                                <div style={{ background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', padding: '0.3rem 0.8rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold', color: theme.cardText }}>
                                    {todaysEvents.length} {todaysEvents.length === 1 ? 'händelse' : 'händelser'}
                                </div>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', marginRight: '-0.5rem', paddingRight: '0.5rem' }}>
                                {todaysEvents.length === 0 ? (
                                    <div style={{ fontSize: '1.1rem', color: theme.textMuted, fontStyle: 'italic', padding: '1rem 0' }}>
                                        Inga händelser idag. Njut av dagen! 🌟
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {todaysEvents.map((event, idx) => {
                                            const eventTime = new Date(event.start);
                                            const eventEndTime = event.end ? new Date(event.end) : null;
                                            const isPast = eventEndTime && eventEndTime < now;

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
                                                        {isAllDayEvent(event) ? 'Heldag' : eventTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
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
                                                                📍 {event.location}
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
                        <Card onClick={() => setActiveTab('timeline')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                            <div style={{ marginBottom: '0.8rem', color: '#a29bfe' }}>
                                {/* Calendar Icon */}
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: '500' }}>Kalender</div>
                        </Card>

                        {/* 3. Tasks Button */}
                        {/* 3. Tasks Button */}
                        <Card onClick={() => setActiveTab('todos')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                            <div style={{ marginBottom: '0.8rem', color: theme.success }}>
                                {/* Check/Todo Icon */}
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                </svg>
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: '500' }}>Att göra</div>
                            {(() => {
                                const pending = tasks.filter(t => !t.done);
                                if (pending.length === 0) return null;

                                const assignees = [...new Set(pending.map(t => t.assignee).filter(Boolean))].sort();

                                return (
                                    <div style={{ marginTop: '0.2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.8rem', color: theme.textMuted }}>
                                            {pending.length} uppgifter
                                        </div>
                                        {assignees.length > 0 && (
                                            <div style={{ fontSize: '0.7rem', color: theme.textMuted, opacity: 0.8, marginTop: '0.2rem' }}>
                                                {assignees.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </Card>

                        {/* 4. School Schedule Button */}
                        {/* 4. School Schedule Button - Hide for Leon */}
                        {user.name !== 'Leon' && (
                            <Card onClick={() => setActiveTab('schedule')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                <div style={{ marginBottom: '0.8rem', color: '#ff9f43' }}>
                                    {/* School/Book Icon */}
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                                    </svg>
                                </div>
                                <div style={{ fontSize: '1rem', fontWeight: '500' }}>Skolschema</div>
                            </Card>
                        )}

                        {/* 4.5. Meal Plan Card */}
                        <Card onClick={() => setActiveTab('matsedel')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                            <div style={{ marginBottom: '0.8rem', color: '#ff7675' }}>
                                {/* Utensils Icon */}
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path>
                                    <path d="M7 2v20"></path>
                                    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"></path>
                                </svg>
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: '500' }}>Matsedel</div>
                        </Card>


                        {/* 5.5. Next Match Card */}
                        {(() => {
                            const now = new Date();
                            const upcomingMatches = events
                                .filter(e => {
                                    const summary = (e.summary || '').toLowerCase();
                                    const isArsenal = e.source === 'Arsenal FC' || summary.includes('arsenal');
                                    const isOis = e.source === 'Örgryte IS' || summary.includes('örgryte') || summary.includes('orgryte');
                                    return (isArsenal || isOis) && new Date(e.start) > now;
                                })
                                .sort((a, b) => new Date(a.start) - new Date(b.start));

                            const nextMatch = upcomingMatches[0];

                            if (!nextMatch) return null; // Don't show card if no match

                            const isArsenal = nextMatch.source === 'Arsenal FC' || (nextMatch.summary || '').toLowerCase().includes('arsenal');
                            const displayDate = new Date(nextMatch.start);
                            // Remove "Svante:" or any assignee prefix from summary
                            const cleanSummary = nextMatch.summary.replace(/^[^:]+:\s*/, '');

                            return (
                                <Card
                                    onClick={onOpenMatchModal}
                                    style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: theme.cardBg }}
                                >
                                    <div style={{ marginBottom: '0.8rem', color: isArsenal ? '#ff4757' : '#2e86de' }}>
                                        {/* Football Icon */}
                                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <path d="M12 12l4.8 2.4"></path>
                                            <path d="M12 12l0 -5"></path>
                                            <path d="M12 12l-4.8 2.4"></path>
                                            <path d="M12 7l4.3 -2.5"></path>
                                            <path d="M12 7l-4.3 -2.5"></path>
                                            <path d="M16.8 14.4l2.2 3.8"></path>
                                            <path d="M7.2 14.4l-2.2 3.8"></path>
                                        </svg>
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.2rem' }}>
                                        Nästa match
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: theme.cardText, fontWeight: '600', lineHeight: 1.2 }}>
                                        {cleanSummary}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: theme.textMuted }}>
                                        {displayDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </div>
                                </Card>
                            );
                        })()}

                        {/* 6. Create New (Button) */}
                        {/* 5. Create New (Button) */}
                        <Card onClick={() => setActiveTab('create-event')} style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                            <div style={{ marginBottom: '0.5rem', color: theme.cardText }}>
                                {/* Plus Icon */}
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>Ny händelse</div>
                        </Card>

                    </div>
                </div>
            </div >
        </>
    );
};

export default NewHome;
