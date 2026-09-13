import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCurrentUser, login, setupStatus } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function Setup() {
  const [state, setState] = useState({ name: "", username: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    setupStatus().then((s) => {
      if (s.system_initialized && !user) navigate("/login");
    });
  }, []);

  const set = (k) => (e) => setState({ ...state, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (state.password !== state.confirm) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/v1/setup/initialize/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Initialization failed");
      await login(state.username, state.password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="card" style={{ width: 400, textAlign: "center" }}>
          <div className="h1">Platform initialized</div>
          <p className="muted">The system administrator account has been created. You can now sign in.</p>
          <button className="btn" onClick={() => login(state.username, state.password).then(() => navigate("/"), (err) => setError(err.message))}>
            Sign In
          </button>
          {error && <div className="err">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ width: 420 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 8 }}>
          Initialize GIS Platform
          <span>Create the first System Administrator</span>
        </div>
        <form onSubmit={submit}>
          <label>Admin Name</label>
          <input value={state.name} onChange={set("name")} autoFocus />
          <label>Username</label>
          <input value={state.username} onChange={set("username")} />
          <label>Email</label>
          <input value={state.email} onChange={set("email")} />
          <label>Password</label>
          <input type="password" value={state.password} onChange={set("password")} />
          <label>Confirm Password</label>
          <input type="password" value={state.confirm} onChange={set("confirm")} />
          {error && <div className="err">{error}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Initializing..." : "Initialize System"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}