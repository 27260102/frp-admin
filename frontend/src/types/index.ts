export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface FrpcConfig {
  id: number;
  name: string;
  user: string;
  remark: string;
  // frpc 在线管理配置
  admin_enabled: boolean;
  admin_port: number;
  admin_user: string;
  admin_pass: string;
  admin_remote_port: number;
  created_at: string;
  updated_at: string;
  proxies?: Proxy[];
  visitors?: Visitor[];
}

export interface Proxy {
  id: number;
  frpc_config_id: number;
  name: string;
  type: 'tcp' | 'udp' | 'stcp' | 'xtcp' | 'sudp';
  local_ip: string;
  local_port: number;
  remote_port: number;
  secret_key: string;
  allow_users: string;
  // 传输选项
  bandwidth_limit: string;
  bandwidth_limit_mode: string;
  use_encryption: boolean;
  use_compression: boolean;
  // 健康检查
  health_check_type: string;
  health_check_timeout_seconds: number;
  health_check_max_failed: number;
  health_check_interval_seconds: number;
  health_check_path: string;
  // 插件配置
  plugin_type: string;
  plugin_params: string;
  extra_config: string;
  created_at: string;
  updated_at: string;
}

export interface Visitor {
  id: number;
  frpc_config_id: number;
  name: string;
  type: 'stcp' | 'xtcp' | 'sudp';
  server_name: string;
  secret_key: string;
  bind_addr: string;
  bind_port: number;
  source_proxy_id?: number;
  created_at: string;
  updated_at: string;
}

export interface AvailableProxy extends Proxy {
  client_name: string;
  client_user: string;
  server_name: string;
}

export interface FrpsStatus {
  running: boolean;
  pid: number;
  start_time: string;
  uptime: string;
}

export interface ServerInfo {
  version: string;
  bind_port: number;
  vhost_http_port: number;
  vhost_https_port: number;
  subdomain_host: string;
  total_traffic_in: number;
  total_traffic_out: number;
  cur_conns: number;
  client_counts: number;
  proxy_type_counts: Record<string, number>;
}

export interface ProxyInfo {
  name: string;
  conf: Record<string, unknown>;
  clientVersion: string;
  todayTrafficIn: number;
  todayTrafficOut: number;
  curConns: number;
  lastStartTime: string;
  lastCloseTime: string;
  status: string;
}

export interface Settings {
  server_addr?: string;
  server_port?: string;
  auth_token?: string;
  dashboard_addr?: string;
  dashboard_port?: string;
  dashboard_user?: string;
  dashboard_pass?: string;
  port_pool_start?: string;
  port_pool_end?: string;
  admin_port_pool_start?: string;
  admin_port_pool_end?: string;
}
