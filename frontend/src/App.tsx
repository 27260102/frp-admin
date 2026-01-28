import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ServerConfig from './pages/ServerConfig';
import ClientList from './pages/ClientList';
import ProxyStatus from './pages/ProxyStatus';
import Settings from './pages/Settings';

// 路由保护组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('frp_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="server" element={<ServerConfig />} />
          <Route path="clients" element={<ClientList />} />
          <Route path="proxies" element={<ProxyStatus />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
