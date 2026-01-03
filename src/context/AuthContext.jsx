import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if user is already logged in
        const storedUser = authService.getCurrentUser();
        if (storedUser) {
            setUser(storedUser);
        }
        setLoading(false);
    }, []);

    const login = async (url, username, password) => {
        const data = await authService.login(url, username, password);
        setUser(data);
        localStorage.setItem('docuware_session_start', Date.now().toString());
        return data;
    };

    const logout = () => {
        authService.logout();
        setUser(null);
        localStorage.removeItem('docuware_session_start');
    };

    const reloadUser = useCallback(() => {
        const storedUser = authService.getCurrentUser();
        if (storedUser) {
            console.log('🔄 AuthContext: Reloading user from storage...', storedUser);
            setUser(storedUser);
        } else {
            console.log('⚠️ AuthContext: No user found in storage during reload.');
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, login, logout, reloadUser, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
