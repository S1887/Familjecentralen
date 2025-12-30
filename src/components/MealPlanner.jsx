import React, { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/api';

// Get ISO week number and year
const getWeekInfo = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return {
        year: d.getFullYear(),
        week: weekNo,
        weekString: `${d.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`
    };
};

// Get dates for a week
const getWeekDates = (year, week) => {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }

    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(ISOweekStart);
        d.setDate(ISOweekStart.getDate() + i);
        dates.push(d);
    }
    return dates;
};

const MealPlanner = ({ holidays = [], darkMode, events = [], onNavigateToCalendar }) => {
    // ... (state unchanged)
    const [currentWeek, setCurrentWeek] = useState(() => getWeekInfo(new Date()));
    const [meals, setMeals] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [aiInstructions, setAiInstructions] = useState('');
    const [regeneratingDay, setRegeneratingDay] = useState(null); // Track which day is regenerating

    // Theme (unchanged)
    const theme = {
        bg: darkMode ? '#1a1a2e' : '#f8f9fa',
        cardBg: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
        text: darkMode ? '#fff' : '#2d3436',
        textMuted: darkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
        accent: '#ff7675',
        inputBg: darkMode ? 'rgba(255,255,255,0.1)' : '#fff',
        border: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    };

    // Fetch meals for current week
    const fetchMeals = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(getApiUrl(`api/meals/${currentWeek.weekString}`));
            const data = await response.json();
            setMeals(data);
        } catch (error) {
            console.error('Error fetching meals:', error);
        }
        setLoading(false);
    }, [currentWeek.weekString]);

    useEffect(() => {
        fetchMeals();
    }, [fetchMeals]);

    // Save meals with debounce
    const saveMeals = useCallback(async (newMeals) => {
        setSaving(true);
        try {
            await fetch(getApiUrl(`api/meals/${currentWeek.weekString}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newMeals)
            });
        } catch (error) {
            console.error('Error saving meals:', error);
        }
        setSaving(false);
    }, [currentWeek.weekString]);

    // Update meal (unchanged)
    const updateMeal = (dateStr, mealType, value) => {
        const newMeals = { ...meals };
        if (!newMeals[dateStr]) {
            newMeals[dateStr] = {};
        }
        newMeals[dateStr][mealType] = value;
        setMeals(newMeals);
        saveMeals(newMeals);
    };

    // Navigate weeks
    const goToWeek = (offset) => {
        const currentDate = getWeekDates(currentWeek.year, currentWeek.week)[0];
        currentDate.setDate(currentDate.getDate() + (offset * 7));
        setCurrentWeek(getWeekInfo(currentDate));
    };

    // Check if date is weekend or holiday
    const isWeekendOrHoliday = (date) => {
        const day = date.getDay();
        if (day === 0 || day === 6) return true;

        const dateStr = date.toISOString().split('T')[0];
        return holidays.some(h => h.date === dateStr);
    };

    // Get holiday name for date
    const getHolidayName = (date) => {
        const dateStr = date.toISOString().split('T')[0];
        const holiday = holidays.find(h => h.date === dateStr);
        return holiday ? holiday.name : null;
    };

    // AI suggest meals (Updated)
    const suggestMeals = async (targetDateStr = null) => {
        if (targetDateStr) {
            setRegeneratingDay(targetDateStr);
        } else {
            setSuggesting(true);
        }

        try {
            // Get recent dinners
            const allMeals = await fetch(getApiUrl('api/meals')).then(r => r.json());
            const recentDinners = Object.values(allMeals)
                .flatMap(week => Object.values(week))
                .map(day => day.dinner)
                .filter(Boolean)
                .slice(-14);

            // Get week dates
            const weekDates = getWeekDates(currentWeek.year, currentWeek.week);
            const dateStrings = weekDates.map(d => d.toISOString().split('T')[0]);

            // Get events
            const weekEvents = events
                .filter(e => {
                    const eventDate = new Date(e.start).toISOString().split('T')[0];
                    return dateStrings.includes(eventDate);
                })
                .map(e => ({
                    date: new Date(e.start).toISOString().split('T')[0],
                    summary: e.summary
                }));

            const response = await fetch(getApiUrl('api/meals/suggest'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recentMeals: recentDinners,
                    weekEvents: weekEvents,
                    dates: dateStrings,
                    customInstructions: aiInstructions, // Pass instructions
                    targetDate: targetDateStr // Pass target date if specific day
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                console.error('AI Error:', errData);
                if (response.status === 500 && errData.error?.includes('429')) {
                    alert('AI:n är lite upptagen (Rate Limit). Vänta en minut och försök igen! 🕒');
                } else {
                    alert('Kunde inte hämta förslag. ' + (errData.error || 'Okänt fel'));
                }
            } else {
                const data = await response.json();

                // Handle different response types based on request logic
                // If single string (single day) or array (full week)

                // Note: Backend logic for single day returns { suggestions: ["Meal Name"], ... } ? 
                // Wait, my backend implementation for single day returned just a string?
                // Let's check: "res.json({ suggestions, busyDays: ... })" is for the main block.
                // The SINGLE DAY block in backend currently returns TEXT directly via res.send?
                // No, I updated backend to use `res.json({ suggestions, ... })` for the main block.
                // But for the `if (targetDate)` block in backend, I need to make sure I return JSON format!
                // Ah, looking at my backend update: 
                // `const jsonMatch = text.match(/\[[\s\S]*\]/);` -> This expects an ARRAY.
                // My single day prompt says: "Svara ENDAST med en sträng (namnet på maträtten)".
                // That regex won't match a simple string! 
                // I need to fix backend to handle single string response or prompt for array of 1.
                // Let's assume for now I will fix backend in next step or adjust prompt there.
                // Actually, I should probably adjust the frontend to handle what the backend currently does,
                // OR fix the backend.
                // The backend currently tries to match `[`...`]`.
                // Single day prompt: "Svara ENDAST med en sträng".
                // This means backend will FAIL to parse JSON and error out.
                // I MUST FIX BACKEND FIRST or adjust frontend call.
                // But since I'm in frontend edit, I will write frontend expecting a proper response,
                // and then I will go back to backend to ensure it returns { suggestions: ["Meal"] } for single day too.

                if (targetDateStr) {
                    // Start of single day handling
                    // Assuming backend returns { suggestions: ["Meal Name"] }
                    if (data.suggestions && data.suggestions.length > 0) {
                        const newMeals = { ...meals };
                        if (!newMeals[targetDateStr]) newMeals[targetDateStr] = {};

                        // Backend for single day might return just a string if I fix it, 
                        // or an array of 1 if I fix prompt.
                        // Let's handle array as standard.
                        const mealName = Array.isArray(data.suggestions) ? data.suggestions[0] : data.suggestions;
                        newMeals[targetDateStr].dinner = mealName;
                        setMeals(newMeals);
                        saveMeals(newMeals);
                    }
                } else {
                    // Full week handling
                    if (data.suggestions) {
                        const newMeals = { ...meals };
                        let suggestionIndex = 0;
                        weekDates.forEach(date => {
                            const dateStr = date.toISOString().split('T')[0];
                            if (!newMeals[dateStr]) newMeals[dateStr] = {};
                            // Only overwrite empty or if user specifically asked for full regen?
                            // Logic: For full week gen, we overwrite EMPTY slots, OR if we force it?
                            // Current logic only overwrote empty.
                            // User request: "Generera en hel vecka". Usually implies filling gaps or potentially overwriting.
                            // Let's stick to filling gaps for safety unless we add a "Force overwrite" toggle.
                            // But usually if you type instructions you expect results.
                            // Let's allow overwriting if instructions are present? No, that's risky.
                            // Let's keep filling gaps for now, maybe clear week first?
                            // Let's stick to filling gaps to be safe.
                            if (!newMeals[dateStr].dinner && suggestionIndex < data.suggestions.length) {
                                newMeals[dateStr].dinner = data.suggestions[suggestionIndex];
                                suggestionIndex++;
                            }
                        });
                        setMeals(newMeals);
                        saveMeals(newMeals);
                    }
                }
            }
        } catch (error) {
            console.error('Error suggesting meals:', error);
            alert('Ett fel uppstod vid kontakt med servern.');
        }
        setSuggesting(false);
        setRegeneratingDay(null);
    };

    const weekDates = getWeekDates(currentWeek.year, currentWeek.week);
    const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

    return (
        <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
            {/* Header (unchanged) */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                gap: '1rem'
            }}>
                <button
                    onClick={() => goToWeek(-1)}
                    style={{
                        background: theme.cardBg,
                        border: 'none',
                        borderRadius: '12px',
                        padding: '0.75rem 1rem',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        color: theme.text
                    }}
                >
                    ◀
                </button>

                <div style={{ textAlign: 'center' }}>
                    <h2 style={{ margin: 0, color: theme.text }}>
                        Matsedel
                    </h2>
                    <div style={{ color: theme.textMuted, fontSize: '0.9rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span>Vecka {currentWeek.week}, {currentWeek.year}</span>
                        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                            {weekDates[0].getDate()} {weekDates[0].toLocaleDateString('sv-SE', { month: 'short' }).replace('.', '')} - {weekDates[6].getDate()} {weekDates[6].toLocaleDateString('sv-SE', { month: 'short' }).replace('.', '')}
                        </span>
                        {saving && <span style={{ color: theme.accent, fontSize: '0.8rem' }}>Sparar...</span>}
                    </div>
                </div>

                <button
                    onClick={() => goToWeek(1)}
                    style={{
                        background: theme.cardBg,
                        border: 'none',
                        borderRadius: '12px',
                        padding: '0.75rem 1rem',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        color: theme.text
                    }}
                >
                    ▶
                </button>
            </div>

            {/* AI Controls */}
            <div style={{
                background: theme.cardBg,
                padding: '1rem',
                borderRadius: '12px',
                marginBottom: '1.5rem',
                border: `1px solid ${theme.border}`
            }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>👩‍🍳</span>
                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>AI-Kock</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        type="text"
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        placeholder="T.ex. 'Vi har mycket kyckling', 'Vegetariskt hela veckan'..."
                        style={{
                            flex: 1,
                            background: theme.inputBg,
                            border: `1px solid ${theme.border}`,
                            borderRadius: '8px',
                            padding: '0.6rem 0.8rem',
                            color: theme.text,
                            fontSize: '0.9rem'
                        }}
                    />
                    <button
                        onClick={() => suggestMeals(null)}
                        disabled={suggesting}
                        style={{
                            background: suggesting ? theme.cardBg : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem',
                            color: '#fff',
                            cursor: suggesting ? 'wait' : 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {suggesting ? '...Tänker' : '✨ Förslag'}
                    </button>
                </div>
                {aiInstructions && (
                    <div style={{ fontSize: '0.75rem', color: theme.textMuted, marginTop: '0.4rem', fontStyle: 'italic' }}>
                        Din instruktion tas med när du trycker på "Förslag" eller regenererar en dag.
                    </div>
                )}
            </div>

            {/* Week grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: theme.textMuted }}>
                    Laddar...
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {weekDates.map((date, index) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const isSpecialDay = isWeekendOrHoliday(date);
                        const holidayName = getHolidayName(date);
                        const dayMeals = meals[dateStr] || {};
                        const isToday = new Date().toDateString() === date.toDateString();
                        const isRegeneratingThis = regeneratingDay === dateStr;

                        return (
                            <div
                                key={dateStr}
                                style={{
                                    background: theme.cardBg,
                                    borderRadius: '16px',
                                    padding: '1rem',
                                    border: isToday ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                                }}
                            >
                                {/* Day header */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '0.75rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <span style={{
                                            fontWeight: 'bold',
                                            color: isSpecialDay ? theme.accent : theme.text,
                                            fontSize: '1.1rem'
                                        }}>
                                            {dayNames[index]} {date.getDate()}/{date.getMonth() + 1}
                                        </span>
                                        {holidayName && (
                                            <span style={{
                                                marginLeft: '0.5rem',
                                                color: theme.accent,
                                                fontSize: '0.85rem'
                                            }}>
                                                🔴 {holidayName}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {/* Events Indicator */}
                                        {(() => {
                                            const dayEvents = events.filter(e => e.start.startsWith(dateStr));
                                            if (dayEvents.length === 0) return null;
                                            return (
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); onNavigateToCalendar && onNavigateToCalendar(dateStr); }}
                                                    style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '0.5rem', cursor: 'pointer' }}
                                                    title="Klicka för att se i kalendern"
                                                >
                                                    {dayEvents.slice(0, 3).map((ev, i) => (
                                                        <div key={i} style={{ fontSize: '0.65rem', color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '80px', textOverflow: 'ellipsis' }}>
                                                            • {ev.summary}
                                                        </div>
                                                    ))}
                                                    {dayEvents.length > 3 && <div style={{ fontSize: '0.65rem', color: theme.textMuted }}>+ {dayEvents.length - 3} till...</div>}
                                                </div>
                                            );
                                        })()}

                                        {isToday && (
                                            <span style={{
                                                background: theme.accent,
                                                color: '#fff',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold'
                                            }}>
                                                IDAG
                                            </span>
                                        )}
                                        {/* Regenerate button */}
                                        <button
                                            onClick={() => suggestMeals(dateStr)}
                                            disabled={isRegeneratingThis || suggesting}
                                            title="Generera nytt förslag för denna dag (använder instruktioner ovan)"
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: isRegeneratingThis ? 'wait' : 'pointer',
                                                fontSize: '1rem',
                                                opacity: 0.7,
                                                padding: '0.2rem',
                                                transition: 'opacity 0.2s',
                                                animation: isRegeneratingThis ? 'spin 1s linear infinite' : 'none'
                                            }}
                                        >
                                            {isRegeneratingThis ? '⏳' : '✨'}
                                        </button>
                                        <style>{`
                                            @keyframes spin { 100% { transform: rotate(360deg); } }
                                        `}</style>
                                    </div>
                                </div>

                                {/* Meal inputs (unchanged structure) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {/* Lunch */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{
                                            width: '70px',
                                            color: theme.textMuted,
                                            fontSize: '0.9rem'
                                        }}>
                                            Lunch
                                        </span>
                                        {isSpecialDay ? (
                                            <input
                                                type="text"
                                                value={dayMeals.lunch || ''}
                                                onChange={(e) => updateMeal(dateStr, 'lunch', e.target.value)}
                                                placeholder="Lunch?"
                                                style={{
                                                    flex: 1,
                                                    background: theme.inputBg,
                                                    border: `1px solid ${theme.border}`,
                                                    borderRadius: '8px',
                                                    padding: '0.6rem 0.8rem',
                                                    color: theme.text,
                                                    fontSize: '0.95rem'
                                                }}
                                            />
                                        ) : (
                                            <input
                                                type="text"
                                                value={dayMeals.lunch || ''}
                                                onChange={(e) => updateMeal(dateStr, 'lunch', e.target.value)}
                                                placeholder="Skola/arbete"
                                                style={{
                                                    flex: 1,
                                                    background: theme.inputBg,
                                                    border: `1px solid ${theme.border}`,
                                                    borderRadius: '8px',
                                                    padding: '0.6rem 0.8rem',
                                                    color: theme.text,
                                                    fontSize: '0.95rem'
                                                }}
                                            />
                                        )}
                                    </div>

                                    {/* Dinner */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{
                                            width: '70px',
                                            color: theme.textMuted,
                                            fontSize: '0.9rem'
                                        }}>
                                            Middag
                                        </span>
                                        <input
                                            type="text"
                                            value={dayMeals.dinner || ''}
                                            onChange={(e) => updateMeal(dateStr, 'dinner', e.target.value)}
                                            placeholder="Middag?"
                                            style={{
                                                flex: 1,
                                                background: theme.inputBg,
                                                border: `1px solid ${theme.border}`,
                                                borderRadius: '8px',
                                                padding: '0.6rem 0.8rem',
                                                color: theme.text,
                                                fontSize: '0.95rem'
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )
            }
        </div >
    );
};

export default MealPlanner;
