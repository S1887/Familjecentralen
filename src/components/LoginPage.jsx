import { useState } from 'react';
import './LoginPage.css';

// User list for display ONLY - No PINs here!
const USERS = [
    { name: 'Svante', role: 'parent' }, // Password removed
    { name: 'Sarah', role: 'parent' },  // Password removed
    { name: 'Algot', role: 'child' },   // Password removed
    { name: 'Tuva', role: 'child' },    // Password removed
    { name: 'Leon', role: 'child' },    // Password removed
];

// Determine API URL based on environment (similar to App.jsx helper)
const getApiUrl = (endpoint) => {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    if (window.location.port === '3001') return '/' + cleanEndpoint;
    // Simple fallback for relative path in production/ingress
    const pathname = window.location.pathname;
    const basePath = pathname.replace(/\/+$/, '');
    return basePath && basePath !== '/' ? basePath + '/' + cleanEndpoint : './' + cleanEndpoint;
};

function LoginPage({ onLogin }) {
    const [selectedUser, setSelectedUser] = useState(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleUserSelect = (user) => {
        setSelectedUser(user);
        setPin('');
        setError('');
    };

    const handlePinSubmit = async () => {
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch(getApiUrl('api/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: selectedUser,
                    pin: pin
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Login successful
                localStorage.setItem('familjecentralen_user', JSON.stringify(data));
                onLogin(data);
            } else {
                // Login failed
                setError(data.error || 'Fel PIN-kod');
                setPin('');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Kunde inte nå servern');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePinChange = (e) => {
        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
        setPin(value);
    };

    const handleBack = () => {
        setSelectedUser(null);
        setPin('');
        setError('');
    };

    if (selectedUser) {
        return (
            <div className="login-container">
                <div className="login-card">
                    <button className="back-btn" onClick={handleBack}>← Tillbaka</button>
                    <h1>Hej {selectedUser}! 👋</h1>
                    <p>Ange din 6-siffriga PIN-kod</p>

                    <form onSubmit={(e) => { e.preventDefault(); handlePinSubmit(); }}>
                        <input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            value={pin}
                            onChange={handlePinChange}
                            className="pin-input"
                            placeholder="••••••"
                            autoFocus
                            disabled={isLoading}
                        />

                        {error && <p className="error-msg">{error}</p>}

                        <button
                            type="submit"
                            className="login-btn"
                            disabled={pin.length !== 6 || isLoading}
                        >
                            {isLoading ? 'Loggar in...' : 'Logga in'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <h1>🏠 Familjecentralen</h1>
                <p>Vem är du?</p>

                <div className="user-buttons">
                    {USERS.map(user => (
                        <button
                            key={user.name}
                            className={`user-btn ${user.name.toLowerCase()}`}
                            onClick={() => handleUserSelect(user.name)}
                        >
                            {user.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
