import React from 'react';
import Icon from './Icon';

const MatchListModal = ({ isOpen, onClose, events, darkMode }) => {
    if (!isOpen) return null;

    const theme = darkMode ? {
        modalBg: '#121212', // Very dark background
        cardBg: '#1c1c1c', // Slightly lighter cards
        textMain: '#ffffff',
        textMuted: '#b3b3b3',
        accent: '#e74c3c', // Red for pin
        closeBtn: '#ffffff'
    } : {
        modalBg: '#f5f5f5',
        cardBg: '#ffffff',
        textMain: '#333333',
        textMuted: '#666666',
        accent: '#e74c3c',
        closeBtn: '#333333'
    };

    const now = new Date();
    const upcomingMatches = events
        .filter(e => {
            const summary = (e.summary || '').toLowerCase();
            const source = (e.source || '').toLowerCase();
            const isArsenal = source.includes('arsenal') || summary.includes('arsenal');
            const isOis = source.includes('örgryte') || summary.includes('örgryte') || summary.includes('orgryte') || summary.includes('öis') || summary.includes('ois');
            return (isArsenal || isOis) && new Date(e.start) > now;
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));

    const getTeamLogo = (event) => {
        const summary = (event.summary || '').toLowerCase();
        const source = (event.source || '').toLowerCase();
        const isArsenal = source.includes('arsenal') || summary.includes('arsenal');

        if (isArsenal) {
            return "https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg";
        } else {
            return "/assets/ois-logo.png";
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)', // Darker overlay
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(5px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: theme.modalBg,
                borderRadius: '24px', // Rounder corners
                width: '100%',
                maxWidth: '380px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                animation: 'slideIn 0.2s ease-out',
                position: 'relative',
                overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>

                {/* Close Button - Top Right */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '8px',
                        color: theme.closeBtn,
                        zIndex: 10
                    }}
                >
                    <Icon name="x" size={24} />
                </button>

                {/* Header */}
                <div style={{
                    padding: '2rem 1rem 1rem 1rem',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: theme.textMain, margin: 0 }}>Kommande matcher</h2>
                    <div style={{ fontSize: '1.5rem' }}>⚽</div>
                </div>

                {/* Content */}
                <div style={{ padding: '0 1rem 1.5rem 1rem', overflowY: 'auto' }}>
                    {upcomingMatches.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: theme.textMuted }}>
                            Inga kommande matcher hittade.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            {upcomingMatches.map((match, idx) => {
                                const startDate = new Date(match.start);
                                const isArsenal = (match.source || '').toLowerCase().includes('arsenal') || (match.summary || '').toLowerCase().includes('arsenal');

                                // Clean up summary
                                let displaySummary = match.summary.replace(/^[^:]+:\s*/, '');

                                return (
                                    <div key={idx} style={{
                                        backgroundColor: theme.cardBg,
                                        borderRadius: '16px',
                                        padding: '1rem',
                                        position: 'relative',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.8rem',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        {/* Top Row: Date/Time & Logo */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ color: theme.textMuted, fontSize: '0.85rem', fontWeight: '500' }}>
                                                {startDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')} • {startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <img
                                                src={getTeamLogo(match)}
                                                alt={isArsenal ? "Arsenal" : "ÖIS"}
                                                style={{ height: '24px', width: 'auto' }}
                                            />
                                        </div>

                                        {/* Middle: Title */}
                                        <div style={{
                                            color: theme.textMain,
                                            fontSize: '1.1rem',
                                            fontWeight: '700',
                                            textAlign: 'center',
                                            lineHeight: '1.3'
                                        }}>
                                            {displaySummary}
                                        </div>

                                        {/* Bottom: Location */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            color: theme.textMuted,
                                            fontSize: '0.85rem'
                                        }}>
                                            <Icon name="mapPin" size={14} style={{ color: theme.accent }} />
                                            <span>{match.location || 'Plats okänd'}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                @keyframes slideIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default MatchListModal;
