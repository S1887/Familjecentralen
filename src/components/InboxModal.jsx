import React, { useState, useEffect } from 'react';

const getApiUrl = (endpoint) => {
    // Same helper as App.jsx (should be in a shared utils file ideally)
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    if (window.location.port === '3001') return '/' + cleanEndpoint;
    const pathname = window.location.pathname;
    if (pathname.includes('ingress') || pathname.includes('hassio')) {
        const basePath = pathname.replace(/\/+$/, '');
        return basePath + '/' + cleanEndpoint;
    }
    return './' + cleanEndpoint;
};

export default function InboxModal({ isOpen, onClose, onImport }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

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
                    <h2>📥 Inkorg Händelser</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                </div>

                {loading && <p>Laddar...</p>}
                {error && <p style={{ color: 'red' }}>{error}</p>}

                {!loading && items.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
                        <p>Inga nya händelser i inkorgen.</p>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {items.map(item => (
                        <div key={item.uid} style={{
                            border: '1px solid var(--border-color, #eee)',
                            padding: '1rem',
                            borderRadius: '8px',
                            background: 'var(--card-bg, #fff)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.1rem' }}>{item.summary}</h3>
                                    <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                                        {new Date(item.start).toLocaleString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '0.2rem' }}>
                                        Källa: {item.source}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button
                                    onClick={() => onImport(item)}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem',
                                        background: '#2ed573',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    ➕ Lägg till
                                </button>
                                <button
                                    onClick={(e) => handleIgnore(item.uid, e)}
                                    style={{
                                        padding: '0.6rem 1rem',
                                        background: 'transparent',
                                        border: '1px solid #ff4757',
                                        color: '#ff4757',
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🚫 Ignorera
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
