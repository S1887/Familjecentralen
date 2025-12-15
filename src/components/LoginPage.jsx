import { useState } from 'react';
import './LoginPage.css';

const USERS = [
    { name: 'Svante', pin: '486512', role: 'parent' },
    { name: 'Sarah', pin: '060812', role: 'parent' },
    { name: 'Algot', pin: '502812', role: 'child' },
    { name: 'Tuva', pin: '502812', role: 'child' },
    { name: 'Leon', pin: '502812', role: 'child' },
];

function LoginPage({ onLogin }) {
    const [selectedUser, setSelectedUser] = useState(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const handleUserSelect = (user) => {
        setSelectedUser(user);
        setPin('');
        setError('');
    };

    const handlePinSubmit = () => {
        const user = USERS.find(u => u.name === selectedUser);
        if (user && user.pin === pin) {
            localStorage.setItem('familjecentralen_user', JSON.stringify(user));
            onLogin(user);
        } else {
            setError('Fel PIN-kod');
            setPin('');
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
                        />

                        {error && <p className="error-msg">{error}</p>}

                        <button
                            type="submit"
                            className="login-btn"
                            disabled={pin.length !== 6}
                        >
                            Logga in
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
