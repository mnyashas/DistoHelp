import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('spm:logout', onLogout);

    if (getToken()) {
      api('/auth/me')
        .then((d) => setUser(d.user))
        .catch(() => setToken(null))
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
    return () => window.removeEventListener('spm:logout', onLogout);
  }, []);

  const login = (token, u) => { setToken(token); setUser(u); };
  const logout = () => { setToken(null); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);