import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Setup from "./pages/Setup.jsx";
import Login from "./pages/Login.jsx";
import Layout from "./pages/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MapViewer from "./pages/MapViewer.jsx";
import DataPage from "./pages/DataPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import FormsPage from "./pages/FormsPage.jsx";
import AdminConsole from "./pages/AdminConsole.jsx";
import PublicMap from "./pages/PublicMap.jsx";

export default function App() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/public/:id" element={<PublicMap />} />
      <Route
        path="/"
        element={user ? <Layout /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Dashboard />} />
        <Route path="maps" element={<MapViewer />} />
        <Route path="data" element={<DataPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="forms" element={<FormsPage />} />
        <Route path="admin/*" element={<AdminConsole />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}