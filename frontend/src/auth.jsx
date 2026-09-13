import React, { createContext, useContext, useEffect, useState } from "react";
import { fetchCurrentUser, setToken, getToken } from "./api.js";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        setToken("");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = {
    user,
    setUser,
    loading,
    isSystemAdmin: !!user?.is_system_admin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}