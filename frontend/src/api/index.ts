import axios from 'axios';
import type { FrpcConfig, Proxy, Visitor, AvailableProxy, FrpsStatus, ServerInfo, ProxyInfo, Settings } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 请求拦截器：添加 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('frp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('frp_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 认证 API
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; username: string }>('/login', { username, password }),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/change-password', { old_password: oldPassword, new_password: newPassword }),
};

// frps 服务管理 API
export const frpsApi = {
  getStatus: () => api.get<FrpsStatus>('/frps/status'),
  start: () => api.post('/frps/start'),
  stop: () => api.post('/frps/stop'),
  restart: () => api.post('/frps/restart'),
  getConfig: () => api.get<{ config: string }>('/frps/config'),
  saveConfig: (config: string) => api.post('/frps/config', { config }),
  verifyConfig: (config: string) => api.post('/frps/verify', { config }),
  getLogs: () => api.get<{ logs: string[] }>('/frps/logs'),
  getParsedConfig: () => api.get('/frps/parsed-config'),
};

// frps Dashboard API
export const dashboardApi = {
  getServerInfo: () => api.get<ServerInfo>('/frps/dashboard/serverinfo'),
  getProxies: () => api.get<{ proxies: ProxyInfo[] }>('/frps/dashboard/proxies'),
};

// frpc 配置管理 API
export const clientApi = {
  list: () => api.get<{ clients: FrpcConfig[] }>('/clients'),
  create: (data: Partial<FrpcConfig>) => api.post<FrpcConfig>('/clients', data),
  update: (id: number, data: Partial<FrpcConfig>) => api.put<FrpcConfig>(`/clients/${id}`, data),
  delete: (id: number) => api.delete(`/clients/${id}`),
  download: (id: number) => api.get(`/clients/${id}/download`, { responseType: 'blob' }),
  // frpc 在线管理
  getFrpcStatus: (id: number) => api.get(`/clients/${id}/frpc/status`),
  reloadFrpc: (id: number) => api.post(`/clients/${id}/frpc/reload`),
  stopFrpc: (id: number) => api.post(`/clients/${id}/frpc/stop`),
};

// 代理管理 API
export const proxyApi = {
  list: (clientId: number) => api.get<{ proxies: Proxy[] }>(`/clients/${clientId}/proxies`),
  create: (clientId: number, data: Partial<Proxy>) => api.post<Proxy>(`/clients/${clientId}/proxies`, data),
  update: (id: number, data: Partial<Proxy>) => api.put<Proxy>(`/proxies/${id}`, data),
  delete: (id: number) => api.delete(`/proxies/${id}`),
};

// 访问者管理 API
export const visitorApi = {
  list: (clientId: number) => api.get<{ visitors: Visitor[] }>(`/clients/${clientId}/visitors`),
  create: (clientId: number, data: Partial<Visitor>) => api.post<Visitor>(`/clients/${clientId}/visitors`, data),
  update: (id: number, data: Partial<Visitor>) => api.put<Visitor>(`/visitors/${id}`, data),
  delete: (id: number) => api.delete(`/visitors/${id}`),
  getAvailableProxies: (excludeClientId?: number) =>
    api.get<{ proxies: AvailableProxy[] }>('/available-proxies', {
      params: excludeClientId ? { exclude_client_id: excludeClientId } : undefined,
    }),
};

// 系统设置 API
export const settingsApi = {
  get: () => api.get<Settings>('/settings'),
  save: (data: Settings) => api.post('/settings', data),
};

// 端口池 API
export interface PortUsage {
  port: number;
  proxy_name: string;
  proxy_type: string;
  client_name: string;
  client_user: string;
}

export interface PortPoolInfo {
  ports: number[];
  used_ports: number[];
  port_usages: PortUsage[];
  pool_start: number;
  pool_end: number;
  total_used: number;
  total_available: number;
}

export const portPoolApi = {
  getAvailablePorts: () => api.get<PortPoolInfo>('/available-ports'),
};

// 管理端口池 API
export interface AdminPortUsage {
  port: number;
  client_name: string;
  client_user: string;
  admin_port: number;
}

export interface AdminPortPoolInfo {
  pool_start: number;
  pool_end: number;
  total_used: number;
  total_available: number;
  port_usages: AdminPortUsage[];
}

export const adminPortPoolApi = {
  getInfo: () => api.get<AdminPortPoolInfo>('/admin-port-pool'),
};

export default api;
