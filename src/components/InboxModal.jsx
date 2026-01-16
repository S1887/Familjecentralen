import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../utils/api';
import Icon from './Icon';


export default function InboxModal({ isOpen, onClose, onImport, getGoogleLink }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [importedUids, setImportedUids] = useState(new Set());

    useEffect(() => {
        if (isOpen) {
            fetchInbox();
        }
    }, [isOpen]);

    const fetchInbox = async () => {
        setLoading(true);
        try {
            const res = await fetch(getApiUrl('/api/inbox'));
            const data = await res.json();
            // Sort by date (ascending)
            data.sort((a, b) => new Date(a.start) - new Date(b.start));
            setItems(data);
        } catch (err) {
            console.error("Failed to fetch inbox", err);
            setError('Kunde inte hämta händelser.');
        } finally {
            setLoading(false);
        }
    };

    const handleIgnore = async (uid, e) => {
        e.stopPropagation();
        try {
            await fetch(getApiUrl('/api/ignore-event'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid })
            });
            setItems(items.filter(i => i.uid !== uid));
        } catch (err) {
            console.error("Failed to ignore event", err);
        }
    };

    const handleImport = (item) => {
        setImportedUids(prev => new Set([...prev, item.uid]));
        onImport(item);
    };

    const handleSaveToGoogle = (item, e) => {
        if (getGoogleLink) {
            const url = getGoogleLink(item, true); // forceSave = true
            // Mobile-friendly link opening (works in HA app iframe)
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.click();
        }
        // Auto-ignore (hide) from inbox since we handled it
        handleIgnore(item.uid, e);
    };

    const handleReturnToInbox = async (uid) => {
        try {
            await fetch('http://localhost:3001/api/return-to-inbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid })
            });
            setImportedUids(prev => {
                const newSet = new Set(prev);
                newSet.delete(uid);
                return newSet;
            });
            // Refresh inbox to show it again
            fetchInbox();
        } catch (err) {
            console.error("Failed to return to inbox", err);
        }
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
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }} onClick={e => e.stopPropagation()}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2><Icon name="mail" size={20} style={{ marginRight: '0.5rem' }} />Inkorg Händelser</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}><Icon name="x" size={20} /></button>
                </div>

                {loading && <p>Laddar...</p>}
                {error && <p style={{ color: 'red' }}>{error}</p>}

                {!loading && items.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
                        <p>Inga nya händelser i inkorgen.</p>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {items.map(item => {
                        const isPast = new Date(item.start) < new Date();
                        const isImported = importedUids.has(item.uid);
                        return (
                            <div key={item.uid} style={{
                                border: '1px solid var(--border-color, #eee)',
                                padding: '1rem',
                                borderRadius: '8px',
                                background: isImported ? '#e8f5e9' : (isPast ? '#f9f9f9' : 'var(--card-bg, #fff)'),
                                opacity: (isPast || isImported) ? 0.8 : 1,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                position: 'relative'
                            }}>
                                {isPast && !isImported && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '0.5rem',
                                        right: '0.5rem',
                                        background: '#95a5a6',
                                        color: 'white',
                                        fontSize: '0.7rem',
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        fontWeight: 'bold'
                                    }}>
                                        PASSERAD
                                    </div>
                                )}
                                {isImported && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '0.5rem',
                                        right: '0.5rem',
                                        background: '#4caf50',
                                        color: 'white',
                                        fontSize: '0.7rem',
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        fontWeight: 'bold'
                                    }}>
                                        <Icon name="check" size={12} style={{ marginRight: '4px' }} /> TILLAGD
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.1rem', textDecoration: (isPast || isImported) ? 'line-through' : 'none', color: (isPast || isImported) ? '#7f8c8d' : 'inherit' }}>
                                            {item.summary}
                                        </h3>
                                        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                                            {new Date(item.start).toLocaleString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.2rem' }}>
                                            Källa: {item.source}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                    {/* Aktuell - marks event for feed.ics inclusion */}
                                    {!isImported && !isPast && (
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                    // Mark as approved and save event for feed.ics
                                                    await fetch(getApiUrl('/api/approve-inbox'), {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ uid: item.uid, event: item })
                                                    });
                                                    setImportedUids(prev => new Set([...prev, item.uid]));
                                                    // Remove from list after short delay
                                                    setTimeout(() => {
                                                        setItems(items.filter(i => i.uid !== item.uid));
                                                    }, 1000);
                                                } catch (err) {
                                                    console.error("Failed to approve event", err);
                                                }
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '0.6rem',
                                                background: '#2ed573',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.5rem',
                                                minWidth: '120px'
                                            }}
                                        >
                                            <Icon name="check" size={16} /> Aktuell
                                        </button>
                                    )}

                                    {/* Ej aktuell - moves to trash */}
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                await fetch(getApiUrl('/api/ignore-inbox'), {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        uid: item.uid,
                                                        summary: item.summary,
                                                        start: item.start,
                                                        source: item.source
                                                    })
                                                });
                                                setItems(items.filter(i => i.uid !== item.uid));
                                            } catch (err) {
                                                console.error("Failed to trash event", err);
                                            }
                                        }}
                                        style={{
                                            padding: '0.6rem 1rem',
                                            background: 'transparent',
                                            border: '1px solid #ffa502',
                                            color: '#ffa502',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 600
                                        }}
                                    >
                                        <Icon name="ban" size={16} style={{ marginRight: '0.3rem' }} /> Ej aktuell
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>
        </div>
    );
}
