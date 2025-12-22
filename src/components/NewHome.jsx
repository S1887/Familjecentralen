import React, { useState, useEffect } from 'react';
import { getTravelTime, formatDuration } from '../mapService';
import heroCustomImg from '../assets/hero-custom.jpg';
const capitalizeFirst = (str) => str.charAt(0).toUpperCase() + str.slice(1);

const NewHome = ({ user, weather, events, tasks, setActiveTab, onOpenModal, setSelectedDate, setViewMode, holidays, onOpenEventDetail, darkMode }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Filter next upcoming event
    const now = new Date();
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

    // Theme Colors
    const theme = darkMode ? {
        // Dark Mode
        bgOverlay: 'linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.85))',
        cardBg: '#1e2329',
        cardBgHighlight: '#2c3e50',
        accent: '#74b9ff',
        textMain: '#ffffff', // Global text on background
        cardText: '#ffffff', // Text inside cards
        textMuted: '#b2bec3',
        success: '#2ed573',
        warning: '#ffa502',
        weatherWidgetBg: 'rgba(255,255,255,0.08)',
        weatherWidgetBorder: 'rgba(255,255,255,0.1)',
        nextEventBg: 'linear-gradient(135deg, #2c3e50 0%, #1e2329 100%)',
        textColorInverse: '#000'
    } : {
        // Light Mode (Hybrid)
        bgOverlay: 'linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.85))', // DARK background for light mode too
        cardBg: '#ffffff',
        cardBgHighlight: '#f1f2f6',
        accent: '#0984e3',
        textMain: '#ffffff', // Global text on background MUST be white
        cardText: '#2d3436', // Text inside cards MUST be dark
        textMuted: '#636e72',
        success: '#00b894',
        warning: '#fdcb6e',
        weatherWidgetBg: 'rgba(255,255,255,0.2)', // More transparent
        weatherWidgetBorder: 'rgba(255,255,255,0.3)',
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


            {/* Content Container */}
            <div style={{
                minHeight: '100vh',
                color: theme.textMain,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                padding: '2rem 0.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
                width: '100%',
                position: 'relative',
                zIndex: 1,
                boxSizing: 'border-box',
                backgroundImage: `linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.8)), url(${heroCustomImg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
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
                            onClick={() => window.open('https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/2-2703382/Sverige/V%C3%A4stra%20G%C3%B6talands%20l%C3%A4n/Lidk%C3%B6pings%20Kommun/Jakobstorp', '_blank')}
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

                        {/* 1. Next Event - Spans Full Width */}
                        <Card
                            style={{ gridColumn: '1 / -1', minHeight: '160px', background: theme.nextEventBg }}
                            onClick={() => {
                                if (nextEvent && onOpenEventDetail) {
                                    onOpenEventDetail(nextEvent);
                                }
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ fontSize: '0.9rem', color: theme.accent, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    Nästa händelse
                                </div>
                                {nextEvent && (
                                    <div style={{ background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', padding: '0.3rem 0.8rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold', color: theme.cardText }}>
                                        {(() => {
                                            const eventDate = new Date(nextEvent.start);
                                            const now = new Date();
                                            const isToday = eventDate.getDate() === now.getDate() && eventDate.getMonth() === now.getMonth() && eventDate.getFullYear() === now.getFullYear();

                                            const tomorrow = new Date(now);
                                            tomorrow.setDate(tomorrow.getDate() + 1);
                                            const isTomorrow = eventDate.getDate() === tomorrow.getDate() && eventDate.getMonth() === tomorrow.getMonth() && eventDate.getFullYear() === tomorrow.getFullYear();

                                            const diffTime = eventDate - now;
                                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                                            let dayText = '';
                                            if (isToday) dayText = 'Idag';
                                            else if (isTomorrow) dayText = 'Imorgon';
                                            else if (diffDays < 7) dayText = eventDate.toLocaleDateString('sv-SE', { weekday: 'long' }); // "Måndag"
                                            else dayText = eventDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

                                            return (
                                                <>
                                                    <span style={{ color: theme.accent, marginRight: '0.3rem' }}>{capitalizeFirst(dayText)}</span>
                                                    {eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>

                            <div style={{ marginTop: '1rem' }}>
                                {nextEvent ? (
                                    <>
                                        <div style={{ fontSize: '1.8rem', fontWeight: '600', marginBottom: '0.5rem', lineHeight: 1.2, color: theme.cardText }}>
                                            {nextEvent.summary}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: theme.textMuted, fontSize: '1rem' }}>
                                            {nextEvent.location && <span>📍 {nextEvent.location}</span>}
                                            {nextEvent.travelTime && <span>• 🚗 {formatDuration(nextEvent.travelTime.duration)}</span>}
                                            {nextEvent.assignees && nextEvent.assignees.length > 0 && (
                                                <span style={{ marginLeft: (nextEvent.location || nextEvent.travelTime) ? '0.5rem' : 0 }}>
                                                    👥 {nextEvent.assignees.join(', ')}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: '1.2rem', color: theme.textMuted, fontStyle: 'italic' }}>
                                        Inget inplanerat just nu.
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
                            {tasks.filter(t => !t.done).length > 0 && (
                                <div style={{ marginTop: '0.2rem', fontSize: '0.8rem', color: theme.textMuted }}>
                                    {tasks.filter(t => !t.done).length} uppgifter
                                </div>
                            )}
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

                        {/* 5. Weather / Environment (Mockup style based on user image) */}
                        {/* 5. Weather / Environment (Adaptive Gauge) */}
                        <Card style={{ aspectRatio: '1/1', width: '100%', minHeight: 0, background: theme.cardBg, padding: '0.8rem' }}>
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                {(() => {
                                    // Monthly Normals for Lidköping (Daily Mean in Celsius)
                                    // Source: weatherandclimate.com
                                    // Jan: -1, Feb: -0.5, Mar: 2.4, Apr: 8, May: 13, Jun: 16.7, Jul: 19, Aug: 18, Sep: 14, Oct: 9, Nov: 4.5, Dec: 1.2
                                    const NORMALS = [-1, -0.5, 2.4, 8, 13, 16.7, 19, 18, 14, 9, 4.5, 1.2];
                                    const month = new Date().getMonth();
                                    const normal = NORMALS[month];
                                    const current = currentWeather ? currentWeather.temp : normal;

                                    // Calculate position (-20 to +20 from normal)
                                    // Wider range to avoid "maxing out" on slightly warm days
                                    const range = 20;
                                    const diff = current - normal;
                                    const clampedDiff = Math.max(-range, Math.min(range, diff));
                                    const percent = ((clampedDiff + range) / (range * 2)) * 100;

                                    // Gauge Color based on deviation
                                    let color = theme.success; // Normal (Green)
                                    if (diff <= -3 && diff > -7) color = '#74b9ff'; // Cool (Light Blue)
                                    if (diff <= -7) color = '#0984e3'; // Cold (Blue)
                                    if (diff >= 3 && diff < 7) color = '#ffeaa7'; // Warm (Yellow)
                                    if (diff >= 7) color = '#ff7675'; // Hot (Red)

                                    // SVG Path for Arc
                                    // r=40, cx=50, cy=50. Start -135deg, End +135deg (Total 270)
                                    // StrokeDasharray = ~200. Offset handles progress.
                                    // Simplified approach: Background Arc + Foreground Arc
                                    const radius = 35;
                                    const circumference = 2 * Math.PI * radius * 0.75; // 270 degrees
                                    const offset = circumference - ((percent / 100) * circumference);

                                    return (
                                        <div style={{ position: 'relative', width: '100px', height: '60px', overflow: 'hidden', display: 'flex', justifyContent: 'center', marginBottom: '0.2rem' }}>
                                            <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(135deg)' }}>
                                                {/* Background Track */}
                                                <circle cx="50" cy="50" r={radius} fill="none" stroke={darkMode ? "#2d3436" : "#e0e0e0"} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset="0" />
                                                {/* Active Value */}
                                                <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }} />
                                            </svg>
                                            <div style={{ position: 'absolute', bottom: '5px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                                                    {currentWeather ? `${currentWeather.temp}°` : '--'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div style={{ fontSize: '0.75rem', color: theme.textMuted, marginTop: '0.2rem', textAlign: 'center' }}>
                                    Utomhus
                                    <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>(Normalt: {[-1, -0.5, 2.4, 8, 13, 16.7, 19, 18, 14, 9, 4.5, 1.2][new Date().getMonth()]}°)</div>
                                </div>
                            </div>
                        </Card>

                        {/* 5. Create New (Button) */}
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
            </div>
        </>
    );
};

export default NewHome;
