import React, { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/api';
import SavedRecipes from './SavedRecipes';

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

const MealPlanner = ({ holidays = [], darkMode, events = [], onNavigateToCalendar, username = 'unknown', isAdmin = true }) => {
    // ... (state unchanged)
    const [currentWeek, setCurrentWeek] = useState(() => getWeekInfo(new Date()));
    const [meals, setMeals] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [aiInstructions, setAiInstructions] = useState('');
    const [regeneratingDay, setRegeneratingDay] = useState(null); // Track which day is regenerating

    // Regeneration Modal State
    const [regenModalOpen, setRegenModalOpen] = useState(false);
    const [regenTargetDate, setRegenTargetDate] = useState(null);
    const [regenInstruction, setRegenInstruction] = useState('');
    const [regenTypes, setRegenTypes] = useState({ lunch: false, dinner: true });

    // Meal Detail Modal State
    const [mealDetailOpen, setMealDetailOpen] = useState(false);
    const [selectedMeal, setSelectedMeal] = useState(null); // { dateStr, type, name, time, author }
    const [recipe, setRecipe] = useState('');
    const [loadingRecipe, setLoadingRecipe] = useState(false);
    const [recipeRefinement, setRecipeRefinement] = useState('');

    // Saved Recipes View State
    const [showSavedRecipes, setShowSavedRecipes] = useState(false);

    // Open regeneration modal
    const openRegenModal = (dateStr) => {
        setRegenTargetDate(dateStr);
        setRegenInstruction('');
        setRegenTypes({ lunch: false, dinner: true }); // Default to dinner
        setRegenModalOpen(true);
    };

    // Open meal detail modal
    const openMealDetail = (dateStr, type, name, time, author) => {
        setSelectedMeal({ dateStr, type, name, time, author });
        // Load saved recipe if available
        const savedRecipe = meals[dateStr]?.recipes?.[type] || '';
        setRecipe(savedRecipe);
        setRecipeRefinement('');
        setMealDetailOpen(true);
    };

    // Fetch recipe for meal
    const fetchRecipe = async (refinementPrompt = null) => {
        if (!selectedMeal?.name) return;
        setLoadingRecipe(true);
        try {
            const response = await fetch(getApiUrl('api/meals/recipe'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meal: selectedMeal.name,
                    currentRecipe: refinementPrompt ? recipe : null,
                    refinement: refinementPrompt
                })
            });
            const data = await response.json();
            setRecipe(data.recipe || 'Kunde inte hämta recept.');

            // If AI returned a new title, update the UI immediately
            if (data.title && data.title !== selectedMeal.name) {
                console.log('[MealPlanner] Updating title from AI:', data.title);
                setSelectedMeal(prev => ({ ...prev, name: data.title }));
            }

            setRecipeRefinement(''); // Clear prompt after use
        } catch (error) {
            console.error('Error fetching recipe:', error);
            setRecipe('Kunde inte hämta recept.');
        }
        setLoadingRecipe(false);
    };

    // Save recipe to meal and collection
    const saveRecipe = async () => {
        if (!selectedMeal || !recipe) return;

        // Try to extract new dish name from recipe (look for ## heading or first bold line, excluding "INGREDIENSER" etc)
        let newMealName = selectedMeal.name;

        // Helper to validate name candidate
        const isValidName = (name) => {
            const lower = name.toLowerCase();
            // Exclude common headers and strings that end with a colon (e.g. "Ingredienser:")
            if (name.trim().endsWith(':')) return false;

            return name.length < 60 &&
                !lower.includes('ingredienser') &&
                !lower.includes('tillagning') &&
                !lower.includes('gör så här') &&
                !lower.includes('instruktioner') &&
                !lower.includes('servering') &&
                !lower.includes('tips');
        };

        const headingMatch = recipe.match(/^##\s*(.+)$/m);
        // Find ALL bold matches to skip "Ingredienser" if it's the first one
        const boldMatches = [...recipe.matchAll(/^\*\*(.+?)\*\*/gm)];

        if (headingMatch && isValidName(headingMatch[1].trim())) {
            newMealName = headingMatch[1].trim();
        } else if (boldMatches.length > 0) {
            // Find first bold match that isn't a header keyword
            const validBold = boldMatches.find(m => isValidName(m[1].trim()));
            if (validBold) {
                newMealName = validBold[1].trim();
            }
        }

        // Save to meal day data (including updated meal name if extracted)
        const newMeals = { ...meals };
        if (!newMeals[selectedMeal.dateStr]) newMeals[selectedMeal.dateStr] = {};
        if (!newMeals[selectedMeal.dateStr].recipes) newMeals[selectedMeal.dateStr].recipes = {};
        newMeals[selectedMeal.dateStr].recipes[selectedMeal.type] = recipe;

        // Update meal name if it changed
        if (newMealName !== selectedMeal.name) {
            newMeals[selectedMeal.dateStr][selectedMeal.type] = newMealName;
            setSelectedMeal({ ...selectedMeal, name: newMealName });
        }

        setMeals(newMeals);
        saveMeals(newMeals);

        // Save to collection via API
        try {
            await fetch(getApiUrl('api/recipes'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mealName: newMealName,
                    recipe: recipe,
                    date: selectedMeal.dateStr,
                    type: selectedMeal.type
                })
            });
            alert('✅ Recept sparat!' + (newMealName !== selectedMeal.name ? ` Rättnamn uppdaterat till "${newMealName}"` : ''));
        } catch (error) {
            console.error('Error saving recipe:', error);
        }
    };

    // Theme (unchanged)
    const theme = {
        bg: darkMode ? '#121212' : '#f8f9fa',
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

    // Update meal with author tracking
    const updateMeal = (dateStr, mealType, value, time = null, author = null) => {
        const newMeals = { ...meals };
        if (!newMeals[dateStr]) {
            newMeals[dateStr] = {};
        }

        // If updating meal name (string value)
        if (value !== undefined) {
            newMeals[dateStr][mealType] = value;
            // Set author when manually editing (use prop username or default)
            if (!newMeals[dateStr].authors) newMeals[dateStr].authors = {};
            newMeals[dateStr].authors[mealType] = author || username || 'manual';
        }

        // If updating time
        if (time !== null) {
            if (!newMeals[dateStr].times) newMeals[dateStr].times = {};
            newMeals[dateStr].times[mealType] = time;
        }

        setMeals(newMeals);
        saveMeals(newMeals);
    };

    // Navigate weeks
    const goToWeek = (offset) => {
        const currentDate = getWeekDates(currentWeek.year, currentWeek.week)[0];
        currentDate.setDate(currentDate.getDate() + (offset * 7));
        setCurrentWeek(getWeekInfo(currentDate));
    };

    // Check if date is weekend or holiday (for lunch display - weekends show lunch input)
    const isWeekendOrHoliday = (date) => {
        const day = date.getDay();
        // Sunday is a day off, Saturday is not (for lunch purposes)
        if (day === 0) return true;

        const dateStr = date.toISOString().split('T')[0];
        // Holidays have 'start' field (not 'date') and 'isRedDay' flag
        return holidays.some(h => h.start === dateStr && h.isRedDay);
    };

    // Check if date should be displayed with red/holiday styling
    const isRedDay = (date) => {
        const day = date.getDay();
        // Sunday is always a red day
        if (day === 0) return true;

        const dateStr = date.toISOString().split('T')[0];
        // Red if it's a marked red day OR if it has a holiday name
        return holidays.some(h => h.start === dateStr && (h.isRedDay || h.summary));
    };

    // Get holiday name for date (only if it's a named holiday, not just weekend)
    const getHolidayName = (date) => {
        const dateStr = date.toISOString().split('T')[0];
        // Holidays have 'summary' field (not 'name')
        const holiday = holidays.find(h => h.start === dateStr && h.summary);
        return holiday ? holiday.summary : null;
    };

    // AI suggest meals (Updated)
    // AI suggest meals (Updated)
    const suggestMeals = async (targetDateStr = null, types = ['dinner']) => {
        if (targetDateStr) {
            setRegeneratingDay(targetDateStr);
            setRegenModalOpen(false); // Close modal if open
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
                    summary: e.summary,
                    start: e.start,
                    end: e.end,
                    allDay: e.allDay
                }));

            const response = await fetch(getApiUrl('api/meals/suggest'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recentMeals: recentDinners,
                    preferences: 'Barnvänligt, varierat',
                    weekEvents,
                    dates: targetDateStr ? [targetDateStr] : dateStrings,
                    customInstructions: targetDateStr ? regenInstruction : aiInstructions,
                    targetDate: targetDateStr,
                    targetTypes: types
                })
            });

            if (response.status === 429) {
                alert("AI-tjänsten är lite upptagen just nu. Prova igen om en stund!");
                return;
            }

            const data = await response.json();
            console.log('[MealPlanner] API Response:', JSON.stringify(data, null, 2));
            console.log('[MealPlanner] targetDateStr:', targetDateStr, 'types:', types);

            if (data.suggestions) {
                const newMeals = { ...meals };

                if (targetDateStr) {
                    // Single day update - ensure proper deep clone
                    console.log('[MealPlanner] Single day update for:', targetDateStr);
                    console.log('[MealPlanner] Suggestions:', data.suggestions);

                    newMeals[targetDateStr] = {
                        ...newMeals[targetDateStr],
                        times: { ...newMeals[targetDateStr]?.times },
                        authors: { ...newMeals[targetDateStr]?.authors }
                    };

                    if (data.suggestions.lunch) {
                        newMeals[targetDateStr].lunch = data.suggestions.lunch.meal;
                        newMeals[targetDateStr].times.lunch = data.suggestions.lunch.time;
                        newMeals[targetDateStr].authors.lunch = 'AI';
                    }
                    if (data.suggestions.dinner) {
                        newMeals[targetDateStr].dinner = data.suggestions.dinner.meal;
                        newMeals[targetDateStr].times.dinner = data.suggestions.dinner.time;
                        newMeals[targetDateStr].authors.dinner = 'AI';
                    }

                } else {
                    // Full week update - skip manually entered meals
                    data.suggestions.forEach((suggestion, index) => {
                        const dateStr = dateStrings[index];
                        if (!dateStr) return;

                        // Deep clone or create new object for the day
                        newMeals[dateStr] = { ...newMeals[dateStr] };
                        if (!newMeals[dateStr].authors) newMeals[dateStr].authors = {};
                        if (!newMeals[dateStr].times) newMeals[dateStr].times = {};

                        // Check if dinner was manually entered (not AI) - if so, skip it
                        const existingAuthor = newMeals[dateStr].authors?.dinner;
                        const isManualEntry = existingAuthor && existingAuthor !== 'AI' && newMeals[dateStr].dinner;

                        if (!isManualEntry) {
                            if (typeof suggestion === 'object' && suggestion.meal) {
                                newMeals[dateStr].dinner = suggestion.meal;
                                newMeals[dateStr].times.dinner = suggestion.time;
                                newMeals[dateStr].authors.dinner = 'AI';
                            } else {
                                // Fallback for string response
                                newMeals[dateStr].dinner = suggestion;
                                newMeals[dateStr].times.dinner = null;
                                newMeals[dateStr].authors.dinner = 'AI';
                            }
                        }
                    });
                }
                setMeals(newMeals);
                saveMeals(newMeals);
            }

        } catch (error) {
            console.error('Error suggesting meals:', error);
            alert("Kunde inte hämta förslag. Kontrollera din internetanslutning.");
        } finally {
            setSuggesting(false);
            setRegeneratingDay(null);
        }
    };

    const weekDates = getWeekDates(currentWeek.year, currentWeek.week);
    const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

    // Show saved recipes view
    if (showSavedRecipes) {
        return (
            <SavedRecipes
                darkMode={darkMode}
                getApiUrl={getApiUrl}
                onBack={() => setShowSavedRecipes(false)}
            />
        );
    }

    return (
        <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
            {/* Saved Recipes Button */}
            <button
                onClick={() => setShowSavedRecipes(true)}
                style={{
                    width: '100%',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                }}
            >
                📚 Sparade recept
            </button>

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
            {/* AI Chef Section - Only visible for admins */}
            {isAdmin && (
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
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            value={aiInstructions}
                            onChange={(e) => setAiInstructions(e.target.value)}
                            placeholder="T.ex. 'Vi har mycket kyckling', 'Vegetariskt hela veckan'..."
                            style={{
                                flex: '1 1 200px', // Allow grow/shrink, min-basis 200px
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
            )}

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
                                    borderRadius: '16px',
                                    padding: '0.75rem',
                                    border: isToday ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                                }}
                            >
                                {/* Day header */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '0.75rem',
                                    flexWrap: 'wrap',
                                    gap: '0.5rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <span style={{
                                            fontWeight: 'bold',
                                            color: isRedDay(date) ? theme.accent : theme.text,
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
                                                {holidayName}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {/* Events Indicator */}
                                        {(() => {
                                            // Sort events by time
                                            const dayEvents = events
                                                .filter(e => e.start.startsWith(dateStr))
                                                .sort((a, b) => a.start.localeCompare(b.start));

                                            if (dayEvents.length === 0) {
                                                return (
                                                    <div style={{ fontSize: '0.7rem', color: theme.textMuted, opacity: 0.5, fontStyle: 'italic' }}>
                                                        Inga händelser
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); onNavigateToCalendar && onNavigateToCalendar(dateStr); }}
                                                    style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '0.5rem', cursor: 'pointer', flex: '1 1 100px', minWidth: 0, maxWidth: '250px' }}
                                                    title="Klicka för att se i kalendern"
                                                >
                                                    {dayEvents.map((ev, i) => {
                                                        const startTime = ev.start.split('T')[1]?.substring(0, 5);
                                                        const endTime = ev.end ? ev.end.split('T')[1]?.substring(0, 5) : null;
                                                        const timeStr = endTime ? `${startTime}-${endTime}` : startTime;

                                                        return (
                                                            <div key={i} style={{ fontSize: '0.7rem', color: theme.textMuted, lineHeight: '1.2' }}>
                                                                <span style={{ fontWeight: 500, opacity: 0.8 }}>{timeStr}</span> <span style={{ opacity: 1 }}>{ev.summary}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}

                                        {isToday && (
                                            <span style={{
                                                background: theme.accent,
                                                color: '#fff',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                whiteSpace: 'nowrap',
                                                fontWeight: 'bold'
                                            }}>
                                                IDAG
                                            </span>
                                        )}
                                        {/* Regenerate button - Only for admins */}
                                        {isAdmin && (
                                            <button
                                                onClick={() => openRegenModal(dateStr)}
                                                disabled={isRegeneratingThis || suggesting}
                                                title="Generera nytt förslag för denna dag"
                                                style={{
                                                    background: theme.cardBg,
                                                    border: `1px solid ${theme.border}`,
                                                    borderRadius: '6px',
                                                    cursor: isRegeneratingThis ? 'wait' : 'pointer',
                                                    fontSize: '0.8rem',
                                                    padding: '0.2rem 0.5rem',
                                                    marginLeft: 'auto',
                                                    color: theme.textMuted,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem'
                                                }}
                                            >
                                                <span style={{ fontSize: '1rem' }}>{isRegeneratingThis ? '⏳' : '✨'}</span>
                                                <span>Ändra</span>
                                            </button>
                                        )}
                                        <style>{`
                                            @keyframes spin { 100% { transform: rotate(360deg); } }
                                        `}</style>
                                    </div>
                                </div>

                                {/* Meal inputs */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {/* Lunch */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', width: '80px', minHeight: '38px', alignItems: 'flex-start' }}>
                                            <span style={{ color: theme.textMuted, fontSize: '0.9rem' }}>
                                                Lunch
                                                {dayMeals.authors?.lunch && (
                                                    <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem' }} title={dayMeals.authors.lunch}>
                                                        {dayMeals.authors.lunch === 'AI' ? '🤖' : dayMeals.authors.lunch === 'Svante' ? '👨' : dayMeals.authors.lunch === 'Sarah' ? '👩' : '✏️'}
                                                    </span>
                                                )}
                                            </span>
                                            <span style={{ color: theme.text, fontSize: '0.7rem', fontWeight: 'bold', minHeight: '1rem' }}>
                                                {dayMeals.times?.lunch ? `🕒 ${dayMeals.times.lunch}` : ''}
                                            </span>
                                        </div>
                                        <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input
                                                type="text"
                                                value={dayMeals.lunch || ''}
                                                onChange={(e) => isAdmin && updateMeal(dateStr, 'lunch', e.target.value)}
                                                placeholder={isSpecialDay ? "Lunch?" : "Skola/Jobb"}
                                                disabled={!isAdmin}
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    background: theme.inputBg,
                                                    border: `1px solid ${theme.border}`,
                                                    borderRadius: '8px',
                                                    padding: '0.6rem 0.8rem',
                                                    color: dayMeals.lunch ? theme.text : theme.textMuted,
                                                    fontSize: '0.95rem',
                                                    textOverflow: 'ellipsis',
                                                    overflow: 'hidden',
                                                    whiteSpace: 'nowrap',
                                                    opacity: isAdmin ? 1 : 0.7,
                                                    cursor: isAdmin ? 'text' : 'not-allowed'
                                                }}
                                            />
                                            <button
                                                onClick={() => dayMeals.lunch && openMealDetail(dateStr, 'lunch', dayMeals.lunch, dayMeals.times?.lunch, dayMeals.authors?.lunch)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    fontSize: '1.2rem',
                                                    cursor: dayMeals.lunch ? 'pointer' : 'default',
                                                    padding: '0.3rem',
                                                    opacity: dayMeals.lunch ? 0.7 : 0,
                                                    width: '1.8rem'
                                                }}
                                                title={dayMeals.lunch ? "Visa recept" : ""}
                                                disabled={!dayMeals.lunch}
                                            >
                                                📖
                                            </button>
                                        </div>
                                    </div>

                                    {/* Dinner */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', width: '80px', minHeight: '38px', alignItems: 'flex-start' }}>
                                            <span style={{ color: theme.textMuted, fontSize: '0.9rem' }}>
                                                Middag
                                                {dayMeals.authors?.dinner && (
                                                    <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem' }} title={dayMeals.authors.dinner}>
                                                        {dayMeals.authors.dinner === 'AI' ? '🤖' : dayMeals.authors.dinner === 'Svante' ? '👨' : dayMeals.authors.dinner === 'Sarah' ? '👩' : '✏️'}
                                                    </span>
                                                )}
                                            </span>
                                            <span style={{ color: theme.text, fontSize: '0.7rem', fontWeight: 'bold', minHeight: '1rem' }}>
                                                {dayMeals.times?.dinner ? `🕒 ${dayMeals.times.dinner}` : ''}
                                            </span>
                                        </div>
                                        <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input
                                                type="text"
                                                value={dayMeals.dinner || ''}
                                                onChange={(e) => updateMeal(dateStr, 'dinner', e.target.value)}
                                                placeholder="Middag?"
                                                disabled={!isAdmin}
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    background: theme.inputBg,
                                                    border: `1px solid ${theme.border}`,
                                                    borderRadius: '8px',
                                                    padding: '0.6rem 0.8rem',
                                                    color: theme.text,
                                                    fontSize: '0.95rem',
                                                    opacity: isAdmin ? 1 : 0.7,
                                                    cursor: isAdmin ? 'text' : 'not-allowed',
                                                    textOverflow: 'ellipsis',
                                                    overflow: 'hidden',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            />
                                            <button
                                                onClick={() => dayMeals.dinner && openMealDetail(dateStr, 'dinner', dayMeals.dinner, dayMeals.times?.dinner, dayMeals.authors?.dinner)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    fontSize: '1.2rem',
                                                    cursor: dayMeals.dinner ? 'pointer' : 'default',
                                                    padding: '0.3rem',
                                                    opacity: dayMeals.dinner ? 0.7 : 0,
                                                    width: '1.8rem'
                                                }}
                                                title={dayMeals.dinner ? "Visa recept" : ""}
                                                disabled={!dayMeals.dinner}
                                            >
                                                📖
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Regeneration Modal - Only for admins */}
            {isAdmin && regenModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        background: theme.bg,
                        padding: '1.5rem',
                        borderRadius: '12px',
                        border: '1px solid ' + theme.border,
                        width: '90%',
                        maxWidth: '400px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                    }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: theme.text }}>Generera förslag för {regenTargetDate}</h3>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: theme.textMuted, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Vad är ni sugna på?</label>
                            <input
                                type="text"
                                autoFocus
                                value={regenInstruction}
                                onChange={(e) => setRegenInstruction(e.target.value)}
                                placeholder="T.ex. Nåt med kyckling, italienskt..."
                                style={{
                                    width: '100%', padding: '0.75rem', borderRadius: '8px',
                                    border: `1px solid ${theme.border}`, background: theme.inputBg,
                                    color: theme.text, fontSize: '1rem'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: theme.text, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={regenTypes.lunch}
                                    onChange={e => setRegenTypes({ ...regenTypes, lunch: e.target.checked })}
                                    style={{ transform: 'scale(1.2)' }}
                                />
                                Lunch
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: theme.text, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={regenTypes.dinner}
                                    onChange={e => setRegenTypes({ ...regenTypes, dinner: e.target.checked })}
                                    style={{ transform: 'scale(1.2)' }}
                                />
                                Middag
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setRegenModalOpen(false)}
                                style={{
                                    padding: '0.75rem 1rem', background: 'transparent',
                                    border: `1px solid ${theme.textMuted}`, borderRadius: '8px',
                                    color: theme.text, cursor: 'pointer'
                                }}
                            >
                                Avbryt
                            </button>
                            <button
                                onClick={() => {
                                    const types = [];
                                    if (regenTypes.lunch) types.push('lunch');
                                    if (regenTypes.dinner) types.push('dinner');
                                    if (types.length === 0) types.push('dinner'); // Fallback
                                    suggestMeals(regenTargetDate, types);
                                }}
                                style={{
                                    padding: '0.75rem 1.5rem', background: theme.accent,
                                    border: 'none', borderRadius: '8px',
                                    color: '#fff', fontWeight: 'bold', cursor: 'pointer'
                                }}
                            >
                                ✨ Generera
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Meal Detail Modal */}
            {mealDetailOpen && selectedMeal && (
                <div
                    onClick={() => setMealDetailOpen(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                        padding: '1rem'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: theme.bg,
                            padding: '1.5rem',
                            borderRadius: '16px',
                            border: '1px solid ' + theme.border,
                            width: '100%',
                            maxWidth: '500px',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, color: theme.text, fontSize: '1.2rem' }}>
                                {selectedMeal.type === 'lunch' ? '🍽️ Lunch' : '🍽️ Middag'}
                                {selectedMeal.authors && (
                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem' }}>
                                        {selectedMeal.author === 'AI' ? '🤖' : selectedMeal.author === 'Svante' ? '👨' : selectedMeal.author === 'Sarah' ? '👩' : '✏️'}
                                    </span>
                                )}
                            </h3>
                            <button
                                onClick={() => setMealDetailOpen(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: theme.textMuted }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Meal Name */}
                        <div style={{
                            background: theme.cardBg,
                            padding: '1rem',
                            borderRadius: '12px',
                            marginBottom: '1rem',
                            border: '1px solid ' + theme.border
                        }}>
                            <div style={{ fontSize: '1.1rem', color: theme.text, fontWeight: 'bold' }}>
                                {selectedMeal.name}
                            </div>
                            {selectedMeal.time && (
                                <div style={{ fontSize: '0.9rem', color: theme.textMuted, marginTop: '0.5rem' }}>
                                    🕒 {selectedMeal.time}
                                </div>
                            )}
                        </div>

                        {/* Recipe Section */}
                        {!recipe ? (
                            <button
                                onClick={() => fetchRecipe()}
                                disabled={loadingRecipe}
                                style={{
                                    width: '100%',
                                    padding: '1rem',
                                    background: loadingRecipe ? theme.cardBg : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    border: 'none',
                                    borderRadius: '12px',
                                    color: '#fff',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    cursor: loadingRecipe ? 'wait' : 'pointer'
                                }}
                            >
                                {loadingRecipe ? '⏳ Hämtar recept...' : '📖 Visa receptförslag'}
                            </button>
                        ) : (
                            <>
                                {/* Recipe Display */}
                                <div style={{
                                    background: theme.cardBg,
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: '1px solid ' + theme.border,
                                    whiteSpace: 'pre-wrap',
                                    fontSize: '0.9rem',
                                    color: theme.text,
                                    lineHeight: '1.6',
                                    marginBottom: '1rem'
                                }}>
                                    {recipe}
                                </div>

                                {/* Refinement Input */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <input
                                        type="text"
                                        value={recipeRefinement}
                                        onChange={(e) => setRecipeRefinement(e.target.value)}
                                        placeholder="T.ex. 'Byt ut laxen mot kyckling...'"
                                        style={{
                                            width: '100%',
                                            background: theme.inputBg,
                                            border: `1px solid ${theme.border}`,
                                            borderRadius: '8px',
                                            padding: '0.75rem',
                                            color: theme.text,
                                            fontSize: '0.9rem',
                                            marginBottom: '0.5rem'
                                        }}
                                    />
                                    <button
                                        onClick={() => fetchRecipe(recipeRefinement)}
                                        disabled={loadingRecipe || !recipeRefinement.trim()}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            background: recipeRefinement.trim() ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' : theme.cardBg,
                                            border: 'none',
                                            borderRadius: '8px',
                                            color: '#fff',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            cursor: recipeRefinement.trim() ? 'pointer' : 'not-allowed',
                                            opacity: recipeRefinement.trim() ? 1 : 0.5
                                        }}
                                    >
                                        {loadingRecipe ? '⏳ Uppdaterar...' : '✨ Anpassa receptet'}
                                    </button>
                                </div>

                                {/* Save Button */}
                                <button
                                    onClick={saveRecipe}
                                    style={{
                                        width: '100%',
                                        padding: '1rem',
                                        background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                                        border: 'none',
                                        borderRadius: '12px',
                                        color: '#fff',
                                        fontSize: '1rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    💾 Spara recept
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MealPlanner;
