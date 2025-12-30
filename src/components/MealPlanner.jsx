import React, { useState, useEffect, useCallback } from 'react';

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

const MealPlanner = ({ holidays = [], darkMode, events = [] }) => {
    const [currentWeek, setCurrentWeek] = useState(() => getWeekInfo(new Date()));
    const [meals, setMeals] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [suggesting, setSuggesting] = useState(false);

    // Theme
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
            const response = await fetch(`/api/meals/${currentWeek.weekString}`);
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
            await fetch(`/api/meals/${currentWeek.weekString}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newMeals)
            });
        } catch (error) {
            console.error('Error saving meals:', error);
        }
        setSaving(false);
    }, [currentWeek.weekString]);

    // Update meal
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

    // AI suggest meals
    const suggestMeals = async () => {
        setSuggesting(true);
        try {
            // Get recent dinners to avoid repetition
            const allMeals = await fetch('/api/meals').then(r => r.json());
            const recentDinners = Object.values(allMeals)
                .flatMap(week => Object.values(week))
                .map(day => day.dinner)
                .filter(Boolean)
                .slice(-14); // Last 14 dinners

            // Get week dates for this week
            const weekDates = getWeekDates(currentWeek.year, currentWeek.week);
            const dateStrings = weekDates.map(d => d.toISOString().split('T')[0]);

            // Get events for this week
            const weekEvents = events
                .filter(e => {
                    const eventDate = new Date(e.start).toISOString().split('T')[0];
                    return dateStrings.includes(eventDate);
                })
                .map(e => ({
                    date: new Date(e.start).toISOString().split('T')[0],
                    summary: e.summary
                }));

            const response = await fetch('/api/meals/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recentMeals: recentDinners,
                    weekEvents: weekEvents,
                    dates: dateStrings
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
                setSuggesting(false);
                return;
            }

            const data = await response.json();
            if (data.suggestions) {
                // Fill in suggestions for days without dinner
                const weekDates = getWeekDates(currentWeek.year, currentWeek.week);
                const newMeals = { ...meals };
                let suggestionIndex = 0;

                weekDates.forEach(date => {
                    const dateStr = date.toISOString().split('T')[0];
                    if (!newMeals[dateStr]) newMeals[dateStr] = {};
                    if (!newMeals[dateStr].dinner && suggestionIndex < data.suggestions.length) {
                        newMeals[dateStr].dinner = data.suggestions[suggestionIndex];
                        suggestionIndex++;
                    }
                });

                setMeals(newMeals);
                saveMeals(newMeals);
            }
        } catch (error) {
            console.error('Error suggesting meals:', error);
            alert('Ett fel uppstod vid kontakt med servern.');
        }
        setSuggesting(false);
    };

    const weekDates = getWeekDates(currentWeek.year, currentWeek.week);
    const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

    return (
        <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
            {/* Header */}
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
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                        color: theme.text
                    }}
                >
                    ◀
                </button>

                <div style={{ textAlign: 'center' }}>
                    <h2 style={{ margin: 0, color: theme.text }}>
                        🍽️ Matsedel
                    </h2>
                    <div style={{ color: theme.textMuted, fontSize: '0.9rem' }}>
                        Vecka {currentWeek.week}, {currentWeek.year}
                        {saving && <span style={{ marginLeft: '0.5rem', color: theme.accent }}>Sparar...</span>}
                    </div>
                </div>

                <button
                    onClick={() => goToWeek(1)}
                    style={{
                        background: theme.cardBg,
                        border: 'none',
                        borderRadius: '12px',
                        padding: '0.75rem 1rem',
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                        color: theme.text
                    }}
                >
                    ▶
                </button>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setCurrentWeek(getWeekInfo(new Date()))}
                    style={{
                        background: 'transparent',
                        border: `1px solid ${theme.border}`,
                        borderRadius: '8px',
                        padding: '0.5rem 1rem',
                        color: theme.textMuted,
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                    }}
                >
                    📅 Idag
                </button>
                <button
                    onClick={suggestMeals}
                    disabled={suggesting}
                    style={{
                        background: suggesting ? theme.cardBg : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.5rem 1rem',
                        color: '#fff',
                        cursor: suggesting ? 'wait' : 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                    }}
                >
                    {suggesting ? '🤔 Tänker...' : '✨ AI-förslag'}
                </button>
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
                                    <div>
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
                                </div>

                                {/* Meal inputs */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {/* Lunch - all days, but weekdays show "Skola/arbete" */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{
                                            width: '70px',
                                            color: theme.textMuted,
                                            fontSize: '0.9rem'
                                        }}>
                                            🍳 Lunch
                                        </span>
                                        {isSpecialDay ? (
                                            <input
                                                type="text"
                                                value={dayMeals.lunch || ''}
                                                onChange={(e) => updateMeal(dateStr, 'lunch', e.target.value)}
                                                placeholder="Vad äter vi till lunch?"
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

                                    {/* Dinner - always */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{
                                            width: '70px',
                                            color: theme.textMuted,
                                            fontSize: '0.9rem'
                                        }}>
                                            🍽️ Middag
                                        </span>
                                        <input
                                            type="text"
                                            value={dayMeals.dinner || ''}
                                            onChange={(e) => updateMeal(dateStr, 'dinner', e.target.value)}
                                            placeholder="Vad äter vi till middag?"
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
            )}
        </div>
    );
};

export default MealPlanner;
