const BASE = "/api/v1";

let token = localStorage.getItem("gd_token") || "";

export function setToken(t) {
  token = t || "";
  if (t) localStorage.setItem("gd_token", t);
  else localStorage.removeItem("gd_token");
}

export function getToken() {
  return token;
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...options, headers });
  if (res.status === 401) {
    setToken("");
    if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/setup")) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }
  const contentType = res.headers.get("content-type") || "";
  let data = null;
  if (contentType.includes("json")) data = await res.json();
  else data = await res.text();
  if (!res.ok) {
    const detail = data?.detail || (typeof data === "string" ? data : JSON.stringify(data));
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path, params) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request(path + qs);
  },
  post: (path, body, headers) => request(path, { method: "POST", body: JSON.stringify(body), headers }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path) => request(path, { method: "DELETE" }),
  upload: (path, formData) =>
    request(path, { method: "POST", body: formData, headers: {} }),
};

export async function login(username, password) {
  const res = await fetch(BASE + "/auth/login/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Login failed");
  setToken(data.access);
  return data;
}

export async function fetchCurrentUser() {
  return api.get("/users/me/");
}

export async function setupStatus() {
  const res = await fetch(BASE + "/setup/status/");
  return res.json();
}