import { useState, useEffect } from 'react';

const SavedRecipes = ({ darkMode, getApiUrl, onBack }) => {
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all', 'lunch', 'dinner'
    const [expandedRecipe, setExpandedRecipe] = useState(null);

    const theme = {
        bg: darkMode ? '#1a1a2e' : '#f8f9fa',
        cardBg: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
        text: darkMode ? '#fff' : '#2d3436',
        textMuted: darkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
        accent: '#ff7675',
        border: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
        inputBg: darkMode ? 'rgba(255,255,255,0.1)' : '#fff'
    };

    // Fetch saved recipes
    useEffect(() => {
        const fetchRecipes = async () => {
            try {
                const response = await fetch(getApiUrl('api/recipes'));
                const data = await response.json();
                setRecipes(data);
            } catch (error) {
                console.error('Error fetching recipes:', error);
            }
            setLoading(false);
        };
        fetchRecipes();
    }, [getApiUrl]);

    // Delete recipe
    const deleteRecipe = async (id) => {
        if (!confirm('Vill du ta bort detta recept?')) return;
        try {
            await fetch(getApiUrl(`api/recipes/${id}`), { method: 'DELETE' });
            setRecipes(recipes.filter(r => r.id !== id));
        } catch (error) {
            console.error('Error deleting recipe:', error);
        }
    };

    // Filter recipes
    const filteredRecipes = recipes.filter(recipe => {
        const matchesSearch = recipe.mealName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            recipe.recipe.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'all' || recipe.type === filterType;
        return matchesSearch && matchesType;
    });

    // Format date
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    };

    return (
        <div style={{ padding: '1rem', minHeight: '100vh', background: theme.bg }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        padding: '0.5rem'
                    }}
                >
                    ←
                </button>
                <h2 style={{ color: theme.text, margin: 0, fontSize: '1.5rem' }}>
                    📚 Sparade recept
                </h2>
            </div>

            {/* Search & Filter */}
            <div style={{
                display: 'flex',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                flexWrap: 'wrap'
            }}>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 Sök recept..."
                    style={{
                        flex: 1,
                        minWidth: '200px',
                        background: theme.inputBg,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '12px',
                        padding: '0.75rem 1rem',
                        color: theme.text,
                        fontSize: '1rem'
                    }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {['all', 'lunch', 'dinner'].map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            style={{
                                padding: '0.75rem 1rem',
                                background: filterType === type
                                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                    : theme.cardBg,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '12px',
                                color: filterType === type ? '#fff' : theme.text,
                                fontSize: '0.9rem',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            {type === 'all' ? 'Alla' : type === 'lunch' ? '🍽️ Lunch' : '🍲 Middag'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div style={{
                color: theme.textMuted,
                marginBottom: '1rem',
                fontSize: '0.9rem'
            }}>
                {filteredRecipes.length} recept{filteredRecipes.length !== 1 ? '' : ''}
            </div>

            {/* Recipes List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: theme.textMuted }}>
                    ⏳ Laddar recept...
                </div>
            ) : filteredRecipes.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    color: theme.textMuted,
                    background: theme.cardBg,
                    borderRadius: '16px'
                }}>
                    {recipes.length === 0
                        ? '📝 Inga sparade recept ännu. Spara ett recept från matsedeln!'
                        : '🔍 Inga recept matchar din sökning.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {filteredRecipes.map(recipe => (
                        <div
                            key={recipe.id}
                            style={{
                                background: theme.cardBg,
                                borderRadius: '16px',
                                border: `1px solid ${theme.border}`,
                                overflow: 'hidden'
                            }}
                        >
                            {/* Recipe Header */}
                            <div
                                onClick={() => setExpandedRecipe(expandedRecipe === recipe.id ? null : recipe.id)}
                                style={{
                                    padding: '1rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <div>
                                    <div style={{
                                        color: theme.text,
                                        fontSize: '1.1rem',
                                        fontWeight: 'bold',
                                        marginBottom: '0.25rem'
                                    }}>
                                        {recipe.type === 'lunch' ? '🍽️' : '🍲'} {recipe.mealName}
                                    </div>
                                    <div style={{ color: theme.textMuted, fontSize: '0.8rem' }}>
                                        {formatDate(recipe.savedAt)}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteRecipe(recipe.id); }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            fontSize: '1rem',
                                            cursor: 'pointer',
                                            opacity: 0.5,
                                            padding: '0.25rem'
                                        }}
                                        title="Ta bort"
                                    >
                                        🗑️
                                    </button>
                                    <span style={{ color: theme.textMuted, fontSize: '1.2rem' }}>
                                        {expandedRecipe === recipe.id ? '▼' : '▶'}
                                    </span>
                                </div>
                            </div>

                            {/* Recipe Content (Expandable) */}
                            {expandedRecipe === recipe.id && (
                                <div style={{
                                    padding: '1rem',
                                    paddingTop: 0,
                                    borderTop: `1px solid ${theme.border}`,
                                    marginTop: '0'
                                }}>
                                    <div style={{
                                        background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                                        padding: '1rem',
                                        borderRadius: '12px',
                                        marginTop: '1rem',
                                        whiteSpace: 'pre-wrap',
                                        fontSize: '0.9rem',
                                        color: theme.text,
                                        lineHeight: '1.6'
                                    }}>
                                        {recipe.recipe}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SavedRecipes;
