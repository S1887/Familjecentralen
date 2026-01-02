import { useState, useEffect } from 'react';

const SavedRecipes = ({ darkMode, getApiUrl, onBack }) => {
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [expandedRecipe, setExpandedRecipe] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editedRecipe, setEditedRecipe] = useState('');
    const [editedNotes, setEditedNotes] = useState('');
    const [editedCategory, setEditedCategory] = useState('');
    const [saving, setSaving] = useState(false);

    // Food categories for filtering
    const CATEGORIES = [
        { id: 'all', label: 'Alla', icon: '📚' },
        { id: 'kott', label: 'Kött', icon: '🥩' },
        { id: 'fagel', label: 'Fågel', icon: '🍗' },
        { id: 'fisk', label: 'Fisk', icon: '🐟' },
        { id: 'vegetariskt', label: 'Vego', icon: '🥬' },
        { id: 'pasta', label: 'Pasta', icon: '🍝' },
        { id: 'ovrigt', label: 'Övrigt', icon: '🍽️' }
    ];

    const theme = {
        bg: darkMode ? '#121212' : '#f8f9fa',
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

    // Start editing a recipe
    const startEditing = (recipe) => {
        setEditingId(recipe.id);
        // Clean up the recipe text for editing - convert \n to real newlines
        let cleanRecipe = recipe.recipe || '';
        if (cleanRecipe.includes('\\n')) {
            cleanRecipe = cleanRecipe.replace(/\\n/g, '\n');
        }
        setEditedRecipe(cleanRecipe);
        setEditedNotes(recipe.notes || '');
        setEditedCategory(recipe.category || 'ovrigt');
        setExpandedRecipe(recipe.id);
    };

    // Save edited recipe
    const saveEditedRecipe = async (id) => {
        setSaving(true);
        try {
            const response = await fetch(getApiUrl(`api/recipes/${id}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipe: editedRecipe,
                    notes: editedNotes,
                    category: editedCategory
                })
            });
            if (response.ok) {
                // Update local state
                setRecipes(recipes.map(r =>
                    r.id === id ? { ...r, recipe: editedRecipe, notes: editedNotes, category: editedCategory } : r
                ));
                setEditingId(null);
            }
        } catch (error) {
            console.error('Error saving recipe:', error);
            alert('Kunde inte spara receptet.');
        }
        setSaving(false);
    };

    // Cancel editing
    const cancelEditing = () => {
        setEditingId(null);
        setEditedRecipe('');
        setEditedNotes('');
        setEditedCategory('');
    };

    // Filter recipes
    const filteredRecipes = recipes.filter(recipe => {
        const matchesSearch = recipe.mealName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            recipe.recipe.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = filterCategory === 'all' || recipe.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    // Format date
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    };

    // Format recipe text - clean up and structure like a real recipe document
    const formatRecipeText = (text) => {
        if (!text) return null;

        let formatted = text;

        // If it looks like JSON, try to parse it and extract recipe field
        if (formatted.trim().startsWith('{') && formatted.includes('"recipe"')) {
            try {
                const parsed = JSON.parse(formatted);
                formatted = parsed.recipe || formatted;
            } catch (e) {
                // Not valid JSON, continue with original
            }
        }

        // Convert literal \n to actual newlines
        formatted = formatted.replace(/\\n/g, '\n');

        // Split into lines for processing
        const lines = formatted.split('\n');
        const sections = [];
        let currentSection = { title: '', items: [] };

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Detect section headers: INGREDIENSER, TILLAGNING, TIPS, etc.
            const isHeader = /^(#{1,3}\s*)?\*?\*?(INGREDIENSER|TILLAGNING|TIPS|GÖR SÅ HÄR|INSTRUKTIONER|SERVERING)/i.test(trimmed);
            if (isHeader) {
                if (currentSection.title || currentSection.items.length > 0) {
                    sections.push(currentSection);
                }
                const title = trimmed.replace(/^#{1,3}\s*/, '').replace(/\*\*/g, '').replace(/:$/, '');
                currentSection = { title, items: [] };
            } else {
                // Clean up the line - remove markdown formatting
                let cleanLine = trimmed
                    // Remove bold markers **text** including at start/end
                    .replace(/\*\*([^*]+)\*\*/g, '$1')
                    // Remove single asterisk bullet points
                    .replace(/^\*\s+/, '')
                    // Remove dash/bullet bullet points
                    .replace(/^[-•]\s*/, '')
                    // Remove numbered list prefixes like "1. **Text**:"
                    .replace(/^(\d+\.)\s*\*\*([^*]+)\*\*:?\s*/, '$1 $2: ')
                    // Clean any remaining double asterisks
                    .replace(/\*\*/g, '');

                if (cleanLine) {
                    currentSection.items.push(cleanLine);
                }
            }
        }

        // Push the last section
        if (currentSection.title || currentSection.items.length > 0) {
            sections.push(currentSection);
        }

        return sections;
    };

    // Render formatted recipe sections
    const renderRecipe = (recipeText) => {
        const sections = formatRecipeText(recipeText);
        if (!sections || sections.length === 0) {
            return <div style={{ whiteSpace: 'pre-wrap' }}>{recipeText}</div>;
        }

        return (
            <div style={{ textAlign: 'left' }}>
                {sections.map((section, idx) => (
                    <div key={idx} style={{ marginBottom: '1.5rem' }}>
                        {section.title && (
                            <h4 style={{
                                color: theme.accent,
                                marginBottom: '0.75rem',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                borderBottom: `1px solid ${theme.border}`,
                                paddingBottom: '0.5rem',
                                marginTop: idx > 0 ? '1rem' : 0
                            }}>
                                {section.title}
                            </h4>
                        )}
                        <ul style={{
                            margin: 0,
                            paddingLeft: '1.5rem',
                            listStyleType: section.title?.toUpperCase().includes('TILLAGNING') ? 'decimal' : 'disc'
                        }}>
                            {section.items.map((item, i) => (
                                <li key={i} style={{
                                    marginBottom: '0.5rem',
                                    lineHeight: '1.5'
                                }}>
                                    {item.replace(/^\d+\.\s*/, '')}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        );
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
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setFilterCategory(cat.id)}
                            style={{
                                padding: '0.5rem 0.75rem',
                                background: filterCategory === cat.id
                                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                    : theme.cardBg,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '12px',
                                color: filterCategory === cat.id ? '#fff' : theme.text,
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {cat.icon} {cat.label}
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
                                        onClick={(e) => { e.stopPropagation(); startEditing(recipe); }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            fontSize: '1rem',
                                            cursor: 'pointer',
                                            opacity: 0.5,
                                            padding: '0.25rem'
                                        }}
                                        title="Redigera"
                                    >
                                        ✏️
                                    </button>
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
                                    {editingId === recipe.id ? (
                                        /* Edit Mode */
                                        <div style={{ marginTop: '1rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.text, fontWeight: 'bold' }}>
                                                📝 Recept
                                            </label>
                                            <textarea
                                                value={editedRecipe}
                                                onChange={(e) => setEditedRecipe(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    minHeight: '300px',
                                                    padding: '1rem',
                                                    background: theme.inputBg,
                                                    border: `1px solid ${theme.border}`,
                                                    borderRadius: '8px',
                                                    color: theme.text,
                                                    fontSize: '0.9rem',
                                                    lineHeight: '1.6',
                                                    fontFamily: 'inherit',
                                                    resize: 'vertical'
                                                }}
                                            />

                                            <label style={{ display: 'block', marginTop: '1rem', marginBottom: '0.5rem', color: theme.text, fontWeight: 'bold' }}>
                                                💬 Egna anteckningar
                                            </label>
                                            <textarea
                                                value={editedNotes}
                                                onChange={(e) => setEditedNotes(e.target.value)}
                                                placeholder="Skriv egna kommentarer, tips eller variationer här..."
                                                style={{
                                                    width: '100%',
                                                    minHeight: '100px',
                                                    padding: '0.75rem',
                                                    background: theme.inputBg,
                                                    border: `1px solid ${theme.border}`,
                                                    borderRadius: '8px',
                                                    color: theme.text,
                                                    fontSize: '0.9rem',
                                                    fontFamily: 'inherit',
                                                    resize: 'vertical'
                                                }}
                                            />

                                            <label style={{ display: 'block', marginTop: '1rem', marginBottom: '0.5rem', color: theme.text, fontWeight: 'bold' }}>
                                                🏷️ Kategori
                                            </label>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                                                    <button
                                                        key={cat.id}
                                                        type="button"
                                                        onClick={() => setEditedCategory(cat.id)}
                                                        style={{
                                                            padding: '0.5rem 0.75rem',
                                                            background: editedCategory === cat.id
                                                                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                                                : theme.cardBg,
                                                            border: `1px solid ${theme.border}`,
                                                            borderRadius: '8px',
                                                            color: editedCategory === cat.id ? '#fff' : theme.text,
                                                            fontSize: '0.85rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {cat.icon} {cat.label}
                                                    </button>
                                                ))}
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                                <button
                                                    onClick={() => saveEditedRecipe(recipe.id)}
                                                    disabled={saving}
                                                    style={{
                                                        padding: '0.75rem 1.5rem',
                                                        background: 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        color: '#fff',
                                                        fontWeight: 'bold',
                                                        cursor: saving ? 'wait' : 'pointer'
                                                    }}
                                                >
                                                    {saving ? '⏳ Sparar...' : '💾 Spara'}
                                                </button>
                                                <button
                                                    onClick={cancelEditing}
                                                    style={{
                                                        padding: '0.75rem 1.5rem',
                                                        background: theme.cardBg,
                                                        border: `1px solid ${theme.border}`,
                                                        borderRadius: '8px',
                                                        color: theme.text,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ❌ Avbryt
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* View Mode */
                                        <>
                                            <div style={{
                                                background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                                                padding: '1rem',
                                                borderRadius: '12px',
                                                marginTop: '1rem',
                                                fontSize: '0.9rem',
                                                color: theme.text
                                            }}>
                                                {renderRecipe(recipe.recipe)}
                                            </div>

                                            {/* Show notes if they exist */}
                                            {recipe.notes && (
                                                <div style={{
                                                    background: darkMode ? 'rgba(255,193,7,0.1)' : 'rgba(255,193,7,0.2)',
                                                    padding: '1rem',
                                                    borderRadius: '12px',
                                                    marginTop: '1rem',
                                                    fontSize: '0.9rem',
                                                    color: theme.text,
                                                    borderLeft: '4px solid #ffc107'
                                                }}>
                                                    <strong style={{ display: 'block', marginBottom: '0.5rem' }}>💬 Mina anteckningar:</strong>
                                                    <div style={{ whiteSpace: 'pre-wrap' }}>{recipe.notes}</div>
                                                </div>
                                            )}
                                        </>
                                    )}
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
