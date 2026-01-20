import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/api';
import Icon from './Icon';

// V6.0: "Inkorg" is now "Nya händelser" list.
// Shows events that the user hasn't seen yet.
export default function InboxModal({ isOpen, onClose, currentUser, onMarkAllSeen, getGoogleLink, onEdit }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expandedGroups, setExpandedGroups] = useState(new Set());

    useEffect(() => {
        if (isOpen && currentUser) {
            fetchNewEvents();
        }
    }, [isOpen, currentUser]);

    const fetchNewEvents = async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const url = getApiUrl(`api/new-events?username=${encodeURIComponent(currentUser.name)}&role=${encodeURIComponent(currentUser.role)}`);
            const res = await fetch(url);
            const data = await res.json();

            // Backend V6.0 returns array directly, but check for old structure too
            const events = Array.isArray(data) ? data : (data.events || []);

            if (events.length > 0) {
                // Sort by date (ascending)
                const sorted = events.sort((a, b) => new Date(a.start) - new Date(b.start));
                setItems(sorted);
            } else {
                setItems([]);
            }
        } catch (err) {
            console.error("Failed to fetch new events", err);
            setError('Kunde inte hämta nya händelser.');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAllSeen = async () => {
        if (onMarkAllSeen) {
            await onMarkAllSeen();
            setItems([]); // Clear list immediately
            onClose(); // Close modal
        }
    };

    const handleTrash = async (item, e) => {
        e.stopPropagation();
        if (!window.confirm(`Vill du flytta "${item.summary}" till papperskorgen?`)) return;

        try {
            await fetch(getApiUrl('api/trash'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: item.uid,
                    summary: item.summary,
                    start: item.start,
                    source: item.source
                })
            });
            // Remove from list locally
            setItems(items.filter(i => i.uid !== item.uid));
        } catch (err) {
            console.error("Failed to trash event", err);
            alert("Kunde inte ta bort händelsen.");
        }
    };

    const handleMarkGroupSeen = async (groupEvents, e) => {
        e.stopPropagation();
        if (!window.confirm(`Markera alla ${groupEvents.length} som lästa?`)) return;

        const groupUids = groupEvents.map(ev => ev.uid);
        // Optimistic UI update
        setItems(prev => prev.filter(item => !groupUids.includes(item.uid)));

        // Fire requests
        try {
            await Promise.all(groupUids.map(uid =>
                fetch(getApiUrl('api/mark-seen'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser.name, uid, role: currentUser.role })
                })
            ));
            // Refresh in background to be sure
            fetchNewEvents();
        } catch (err) { console.error(err); }
    };

    // Group items
    const groupedItems = useMemo(() => {
        const groups = {};
        items.forEach(item => {
            const key = `${item.summary}|${item.source}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return Object.values(groups)
            .sort((a, b) => new Date(a[0].start) - new Date(b[0].start));
    }, [items]);

    const toggleGroup = (groupId) => {
        const next = new Set(expandedGroups);
        if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
        setExpandedGroups(next);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200
        }} onClick={onClose}>
            <div style={{
                background: 'var(--modal-bg, white)',
                color: 'var(--text-main, black)',
                padding: '2rem',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '700px',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                position: 'relative'
            }} onClick={e => e.stopPropagation()}>

                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '1rem', right: '1rem',
                        background: 'transparent', border: 'none',
                        fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)'
                    }}
                >×</button>

                <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Icon name="bell" size={24} style={{ color: '#646cff' }} />
                    Nya händelser
                </h2>

                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    Här är händelser som tillkommit eller ändrats sedan du senast tittade.
                </p>

                {error && <p style={{ color: '#ff4757' }}>{error}</p>}

                {loading ? (
                    <p>Laddar...</p>
                ) : !error && items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <Icon name="check" size={48} style={{ color: '#2ed573', marginBottom: '1rem', display: 'block', margin: '0 auto 1rem auto' }} />
                        <p>Du har inga nya händelser!</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {groupedItems.map(group => {
                            const isSingle = group.length === 1;
                            const firstItem = group[0];
                            const groupId = `${firstItem.summary}|${firstItem.source}`;
                            const isExpanded = expandedGroups.has(groupId);

                            if (isSingle) {
                                return (
                                    <div key={firstItem.uid}
                                        onClick={() => {
                                            if (onEdit) {
                                                onEdit(firstItem);
                                                onClose();
                                            }
                                        }}
                                        style={{
                                            padding: '1rem',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            background: 'var(--card-bg)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            cursor: onEdit ? 'pointer' : 'default'
                                        }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{firstItem.summary}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                {new Date(firstItem.start).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                {firstItem.time ? ` kl ${firstItem.time}` : ''}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.2rem' }}>
                                                {firstItem.source}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {/* Trash button removed per user request */}
                                        </div>
                                    </div>
                                );
                            }

                            // Render Group (Multiple items)
                            return (
                                <div key={groupId} style={{ border: '2px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)', overflow: 'hidden' }}>
                                    {/* Group Header */}
                                    <div
                                        onClick={() => toggleGroup(groupId)}
                                        style={{
                                            padding: '1rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            background: 'var(--bg-secondary, rgba(0,0,0,0.03))'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                            <div style={{
                                                background: '#646cff', color: 'white', borderRadius: '50%',
                                                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem'
                                            }}>
                                                {group.length}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{firstItem.summary}</div>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                    {group.length} händelser från {firstItem.source}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <button onClick={(e) => handleMarkGroupSeen(group, e)}
                                                style={{
                                                    border: '1px solid #646cff', borderRadius: '20px', padding: '0.4rem 0.8rem',
                                                    background: 'transparent', color: '#646cff', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem'
                                                }}
                                            >
                                                Markera alla lästa
                                            </button>
                                            <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={20} style={{ opacity: 0.5 }} />
                                        </div>
                                    </div>

                                    {/* Group Content (Expanded) */}
                                    {isExpanded && (
                                        <div style={{ borderTop: '1px solid var(--border-color)' }}>
                                            {group.map(item => {
                                                const dateObj = new Date(item.start);
                                                const dateStr = dateObj.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
                                                const timeStr = item.time || dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                                return (
                                                    <div key={item.uid}
                                                        onClick={() => { if (onEdit) { onEdit(item); onClose(); } }}
                                                        style={{
                                                            padding: '0.8rem 1rem',
                                                            borderBottom: '1px solid var(--border-color)',
                                                            cursor: 'pointer',
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                            background: 'var(--card-bg)', // Fix dark mode
                                                            color: 'var(--text-main)' // Fix dark mode
                                                        }}>
                                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                            <span style={{ fontWeight: '500', minWidth: '100px', textTransform: 'capitalize' }}>{dateStr}</span>
                                                            <span style={{ color: 'var(--text-muted)' }}>{timeStr}</span>
                                                        </div>
                                                        {/* Trash button removed per user request */}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <button
                            onClick={handleMarkAllSeen}
                            style={{
                                marginTop: '1rem',
                                padding: '0.8rem',
                                background: '#646cff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                            }}
                        >
                            <Icon name="check" size={18} />
                            Markera alla som lästa
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
