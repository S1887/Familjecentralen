// Two-Step Edit Modal Component
// Step 1: Read-only view with "Edit" button
// Step 2: Edit form with Delete/Close/Save buttons

import { useState } from 'react';
import Icon from './Icon';

// Name colors matching App.jsx
const NAME_COLORS = {
    'Svante': '#ff4757',
    'Sarah': '#f1c40f',
    'Algot': '#2e86de',
    'Tuva': '#a29bfe',
    'Leon': '#e67e22',
    'Hela Familjen': '#2ed573'
};

const getPersonColor = (person) => NAME_COLORS[person] || '#4a90e2';

const TwoStepEditModal = ({
    editEventData,
    setEditEventData,
    isAdmin,
    isMobile,
    updateEvent,
    deleteEvent,
    setIsEditingEvent,
    getApiUrl
}) => {
    const [isEditingMode, setIsEditingMode] = useState(false);

    if (!editEventData) return null;

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ padding: '2rem', position: 'relative', color: 'var(--card-text)', maxWidth: '600px' }}>
                {/* Close button */}
                <button
                    type="button"
                    onClick={() => setIsEditingEvent(false)}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'transparent',
                        border: 'none',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        color: 'var(--card-text)',
                        padding: '0.25rem',
                        lineHeight: 1
                    }}
                    aria-label="Stäng"
                >×</button>

                <h2>
                    <Icon name="clipboard" size={20} style={{ color: '#646cff', marginRight: '0.5rem' }} />
                    {isEditingMode ? 'Redigera händelse' : 'Händelseinfo'}
                </h2>

                {!isEditingMode ? (
                    /* READ-ONLY VIEW */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Event details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Vad händer?</label>
                                <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{editEventData.summary}</div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Startdatum</label>
                                    <div>{editEventData.date}</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Slutdatum</label>
                                    <div>{editEventData.endDate}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Tid start</label>
                                    <div>{editEventData.time}</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Tid slut</label>
                                    <div>{editEventData.endTime}</div>
                                </div>
                            </div>

                            {editEventData.location && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Plats</label>
                                    <div>{editEventData.location}</div>
                                </div>
                            )}

                            {editEventData.assignees && editEventData.assignees.length > 0 && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Vem gäller det?</label>
                                    <div>{editEventData.assignees.join(', ')}</div>
                                </div>
                            )}

                            {editEventData.category && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Kategori</label>
                                    <div>{editEventData.category}</div>
                                </div>
                            )}

                            {editEventData.description && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>Beskrivning</label>
                                    <div style={{ whiteSpace: 'pre-wrap' }}>{editEventData.description}</div>
                                </div>
                            )}

                            {editEventData.driver && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>
                                        <Icon name="car" size={14} style={{ color: '#74b9ff', marginRight: '0.25rem' }} />
                                        Vem kör?
                                    </label>
                                    <div>{editEventData.driver}</div>
                                </div>
                            )}

                            {editEventData.packer && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>
                                        <Icon name="backpack" size={14} style={{ color: '#a29bfe', marginRight: '0.25rem' }} />
                                        Vem packar?
                                    </label>
                                    <div>{editEventData.packer}</div>
                                </div>
                            )}

                            {editEventData.todos && editEventData.todos.length > 0 && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}><Icon name="clipboard" size={14} style={{ marginRight: '0.3rem' }} />Att-göra-lista</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        {editEventData.todos.map((todo, index) => (
                                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '1.2rem' }}>{todo.done ? <Icon name="check" size={16} /> : ''}</span>
                                                <span style={{ textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? '#888' : 'inherit' }}>
                                                    {todo.text}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Edit button */}
                        {isAdmin && (
                            <button
                                onClick={() => setIsEditingMode(true)}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#646cff',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    boxShadow: '0 2px 4px rgba(100, 108, 255, 0.3)',
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Icon name="edit" size={16} />
                                Redigera händelsen
                            </button>
                        )}
                    </div>
                ) : (
                    /* EDIT FORM */
                    <form onSubmit={updateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Event Title */}
                        <div>
                            <label>Vad händer?</label>
                            <input
                                type="text"
                                required
                                value={editEventData.summary}
                                onChange={e => setEditEventData({ ...editEventData, summary: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                            />
                        </div>

                        {/* Date and Time */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div>
                                <label>Startdatum</label>
                                <input
                                    type="date"
                                    required
                                    value={editEventData.date}
                                    onChange={e => setEditEventData({ ...editEventData, date: e.target.value })}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label>Slutdatum</label>
                                <input
                                    type="date"
                                    value={editEventData.endDate}
                                    onChange={e => setEditEventData({ ...editEventData, endDate: e.target.value })}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div>
                                <label>Tid start</label>
                                <input
                                    type="time"
                                    required
                                    value={editEventData.time}
                                    onChange={e => setEditEventData({ ...editEventData, time: e.target.value })}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label>Tid slut</label>
                                <input
                                    type="time"
                                    required
                                    value={editEventData.endTime}
                                    onChange={e => setEditEventData({ ...editEventData, endTime: e.target.value })}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                        </div>

                        {/* Location */}
                        <div>
                            <label>Plats</label>
                            <input
                                type="text"
                                value={editEventData.location || ''}
                                onChange={e => setEditEventData({ ...editEventData, location: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                            />
                        </div>

                        {/* Assignees */}
                        <div>
                            <label><Icon name="users" size={16} style={{ marginRight: '0.3rem' }} />Vem gäller det?</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                                {['Hela Familjen', 'Svante', 'Sarah', 'Algot', 'Tuva', 'Leon'].map(person => (
                                    <button
                                        key={person}
                                        type="button"
                                        onClick={() => {
                                            const assignees = editEventData.assignees || [];
                                            const newAssignees = assignees.includes(person)
                                                ? assignees.filter(a => a !== person)
                                                : [...assignees, person];
                                            setEditEventData({ ...editEventData, assignees: newAssignees });
                                        }}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: '20px',
                                            border: 'none',
                                            background: (editEventData.assignees || []).includes(person) ? getPersonColor(person) : 'var(--input-bg)',
                                            color: (editEventData.assignees || []).includes(person) ? 'white' : 'var(--text-main)',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        {person}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Category */}
                        <div>
                            <label><Icon name="folder" size={16} style={{ marginRight: '0.3rem' }} />Kategori</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                                {['Handboll', 'Fotboll', 'Bandy', 'Dans', 'Skola', 'Kalas', 'Arbete', 'Annat'].map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setEditEventData({ ...editEventData, category: cat })}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: '20px',
                                            border: 'none',
                                            background: editEventData.category === cat ? '#646cff' : 'var(--input-bg)',
                                            color: editEventData.category === cat ? 'white' : 'var(--text-main)',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label>Beskrivning & Anteckningar</label>
                            <textarea
                                value={editEventData.description || ''}
                                onChange={e => setEditEventData({ ...editEventData, description: e.target.value })}
                                rows={3}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)', resize: 'vertical' }}
                            />
                        </div>

                        {/* Driver and Packer */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div>
                                <label>
                                    <Icon name="car" size={16} style={{ color: '#74b9ff', marginRight: '0.5rem' }} />
                                    Vem kör?
                                </label>
                                <select
                                    value={editEventData.driver || ''}
                                    onChange={e => setEditEventData({
                                        ...editEventData,
                                        driver: e.target.value,
                                        assignments: { ...editEventData.assignments, driver: e.target.value || null }
                                    })}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                >
                                    <option value="">Välj...</option>
                                    <option value="Svante">Svante</option>
                                    <option value="Sarah">Sarah</option>
                                    <option value="Får skjuts">Får skjuts</option>
                                </select>
                            </div>
                            <div>
                                <label>
                                    <Icon name="backpack" size={16} style={{ color: '#a29bfe', marginRight: '0.5rem' }} />
                                    Vem packar?
                                </label>
                                <select
                                    value={editEventData.packer || ''}
                                    onChange={e => setEditEventData({
                                        ...editEventData,
                                        packer: e.target.value,
                                        assignments: { ...editEventData.assignments, packer: e.target.value || null }
                                    })}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                >
                                    <option value="">Välj...</option>
                                    <option value="Svante">Svante</option>
                                    <option value="Sarah">Sarah</option>
                                    <option value="Leon">Leon</option>
                                    <option value="Tuva">Tuva</option>
                                    <option value="Algot">Algot</option>
                                </select>
                            </div>
                        </div>

                        {/* Todo List */}
                        <div>
                            <label><Icon name="check" size={16} style={{ marginRight: '0.3rem' }} />📋 Att-göra-lista inför eventet</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                {(editEventData.todoList || []).map((todo, index) => (
                                    <div key={todo.id || index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={todo.done}
                                            onChange={() => {
                                                const newTodos = [...(editEventData.todoList || [])];
                                                newTodos[index] = { ...todo, done: !todo.done };
                                                setEditEventData({ ...editEventData, todoList: newTodos });
                                            }}
                                        />
                                        <span style={{ flex: 1, textDecoration: todo.done ? 'line-through' : 'none' }}>
                                            {todo.text}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newTodos = (editEventData.todoList || []).filter((_, i) => i !== index);
                                                setEditEventData({ ...editEventData, todoList: newTodos });
                                            }}
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#ff4757', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            <Icon name="trash" size={12} />
                                        </button>
                                    </div>
                                ))}
                                <input
                                    type="text"
                                    id="newTodoInput"
                                    placeholder="Lägg till uppgift..."
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const input = e.target;
                                            if (input.value.trim()) {
                                                const newTodos = [...(editEventData.todoList || []), { id: Date.now(), text: input.value.trim(), done: false }];
                                                setEditEventData({ ...editEventData, todoList: newTodos });
                                                input.value = '';
                                            }
                                        }
                                    }}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
                            {/* Delete button on separate row */}
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (window.confirm(`Ta bort "${editEventData.summary}"?\nHändelsen flyttas till papperskorgen och tas bort från Google Kalender.`)) {
                                            // Use the passed prop function which now handles optimistic UI
                                            deleteEvent(editEventData);
                                        }
                                    }}
                                    style={{
                                        padding: '0.5rem 0.8rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: '#e74c3c',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.3rem'
                                    }}
                                >
                                    <Icon name="trash" size={14} />
                                    Ta bort
                                </button>
                            )}

                            {/* Close and Save on same row */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsEditingMode(false)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'transparent',
                                        color: 'var(--text-main)',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    Stäng
                                </button>
                                {isAdmin && (
                                    <button
                                        type="submit"
                                        style={{
                                            padding: '0.5rem 1.5rem',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: '#646cff',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            boxShadow: '0 2px 4px rgba(100, 108, 255, 0.3)'
                                        }}
                                    >
                                        Spara
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default TwoStepEditModal;
