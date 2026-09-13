import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { fetchCurrentUser, login } from "../api.js";
import { useAuth } from "../auth.jsx";
import { setupStatus } from "../api.js";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  useEffect(() => {
    setupStatus().then((s) => {
      if (!s.system_initialized) navigate("/setup");
    });
  }, []);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      const me = await fetchCurrentUser();
      setUser(me);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ width: 360 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 8 }}>
          GeoDash
          <span>Self-hosted GIS Platform</span>
        </div>
        <form onSubmit={submit}>
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="err">{error}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}