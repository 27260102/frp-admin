import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Tag, InputNumber, Empty, Alert, Tabs, Collapse, Switch, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, SettingOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';
import { clientApi, proxyApi, visitorApi, portPoolApi, PortPoolInfo } from '../api';
import type { FrpcConfig, Proxy, Visitor, AvailableProxy } from '../types';

const proxyTypes = [
  { value: 'tcp', label: 'TCP', desc: 'TCP 端口映射', needsRemotePort: true },
  { value: 'udp', label: 'UDP', desc: 'UDP 端口映射', needsRemotePort: true },
  { value: 'stcp', label: 'STCP', desc: '安全 TCP（访问端也需运行 frpc）', needsSecretKey: true },
  { value: 'xtcp', label: 'XTCP', desc: 'P2P 穿透（访问端也需运行 frpc）', needsSecretKey: true },
  { value: 'sudp', label: 'SUDP', desc: '安全 UDP（访问端也需运行 frpc）', needsSecretKey: true },
];

const visitorTypes = [
  { value: 'stcp', label: 'STCP' },
  { value: 'xtcp', label: 'XTCP' },
  { value: 'sudp', label: 'SUDP' },
];

// 插件类型
const pluginTypes = [
  { value: '', label: '无（直接转发）', desc: '直接转发到本地服务' },
  { value: 'http_proxy', label: 'HTTP 代理', desc: '提供 HTTP 代理服务' },
  { value: 'socks5', label: 'SOCKS5 代理', desc: '提供 SOCKS5 代理服务' },
  { value: 'static_file', label: '静态文件服务', desc: '提供静态文件访问' },
  { value: 'unix_domain_socket', label: 'Unix Socket', desc: '转发到 Unix 套接字' },
];

// 健康检查类型
const healthCheckTypes = [
  { value: '', label: '不启用' },
  { value: 'tcp', label: 'TCP', desc: 'TCP 连接检查' },
  { value: 'http', label: 'HTTP', desc: 'HTTP GET 请求检查' },
];

// 常用端口映射表
const commonPorts: Record<number, string> = {
  22: 'ssh',
  80: 'web',
  443: 'https',
  3306: 'mysql',
  5432: 'postgres',
  6379: 'redis',
  27017: 'mongodb',
  3389: 'rdp',
  5900: 'vnc',
  8080: 'web-8080',
  8443: 'https-8443',
  21: 'ftp',
  23: 'telnet',
  25: 'smtp',
  110: 'pop3',
  143: 'imap',
  1433: 'mssql',
  1521: 'oracle',
  2222: 'ssh-alt',
  9000: 'php-fpm',
  11211: 'memcached',
};

// 生成随机字符串
const generateRandomString = (length: number) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 生成安全的随机密钥
const generateSecretKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 将中文名称转换为拼音首字母或英文
const nameToClientId = (name: string) => {
  // 简单处理：移除中文，保留英文数字，转小写，空格转横线
  const english = name.replace(/[\u4e00-\u9fa5]/g, '').trim();
  if (english) {
    return english.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + generateRandomString(4);
  }
  // 如果全是中文，生成随机ID
  return 'client-' + generateRandomString(6);
};

// 根据端口推断代理名称
const portToProxyName = (port: number, type: string) => {
  const baseName = commonPorts[port] || `${type}-${port}`;
  return `${baseName}-${generateRandomString(4)}`;
};

// 复制文本到剪贴板（兼容非HTTPS环境）
const copyToClipboard = (text: string): Promise<void> => {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // 降级方案：使用 textarea
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    return Promise.resolve();
  } catch {
    return Promise.reject(new Error('Copy failed'));
  } finally {
    document.body.removeChild(textarea);
  }
};

export default function ClientList() {
  const [clients, setClients] = useState<FrpcConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [visitorModalOpen, setVisitorModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<FrpcConfig | null>(null);
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null);
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null);
  const [selectedClient, setSelectedClient] = useState<FrpcConfig | null>(null);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [proxyType, setProxyType] = useState<string>('tcp');
  const [pluginType, setPluginType] = useState<string>('');
  const [healthCheckType, setHealthCheckType] = useState<string>('');
  const [availableProxies, setAvailableProxies] = useState<AvailableProxy[]>([]);
  const [selectedProxyId, setSelectedProxyId] = useState<number | null>(null);
  const [portPoolInfo, setPortPoolInfo] = useState<PortPoolInfo | null>(null);
  const [frpcStatus, setFrpcStatus] = useState<Record<string, unknown[]> | null>(null);
  const [frpcStatusLoading, setFrpcStatusLoading] = useState(false);
  const [form] = Form.useForm();
  const [proxyForm] = Form.useForm();
  const [visitorForm] = Form.useForm();

  const fetchClients = async () => {
    try {
      const res = await clientApi.list();
      setClients(res.data.clients || []);
    } catch {
      message.error('获取列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // 当 clients 更新时，自动同步 selectedClient
  useEffect(() => {
    if (selectedClient) {
      const updated = clients.find(c => c.id === selectedClient.id);
      if (updated) {
        // 只有数据真的变了才更新，避免无限循环
        if (JSON.stringify(updated) !== JSON.stringify(selectedClient)) {
          setSelectedClient(updated);
        }
      }
    }
  }, [clients]);

  const handleCreateOrUpdate = async (values: Partial<FrpcConfig>) => {
    try {
      if (editingClient) {
        await clientApi.update(editingClient.id, values);
        message.success('更新成功');
        setModalOpen(false);
        form.resetFields();
        setEditingClient(null);
        fetchClients(); // useEffect 会自动同步 selectedClient
      } else {
        const res = await clientApi.create(values);
        message.success('创建成功，请添加代理配置');
        setModalOpen(false);
        form.resetFields();
        setEditingClient(null);
        await fetchClients();
        // 自动打开代理管理
        openProxyModal(res.data);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await clientApi.delete(id);
      message.success('删除成功');
      fetchClients();
    } catch {
      message.error('删除失败');
    }
  };

  const handleDownload = async (client: FrpcConfig) => {
    // 检查是否有代理或访问者
    const hasProxies = client.proxies && client.proxies.length > 0;
    const hasVisitors = client.visitors && client.visitors.length > 0;
    if (!hasProxies && !hasVisitors) {
      message.warning('请先添加代理或访问配置');
      openProxyModal(client);
      return;
    }
    try {
      const res = await clientApi.download(client.id);
      const blob = new Blob([res.data], { type: 'application/toml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `frpc_${client.user}.toml`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('配置文件已下载');
    } catch {
      message.error('下载失败，请先在系统设置中配置服务器公网地址');
    }
  };

  const openProxyModal = async (client: FrpcConfig) => {
    setSelectedClient(client);
    setFrpcStatus(null);
    try {
      const [proxyRes, visitorRes] = await Promise.all([
        proxyApi.list(client.id),
        visitorApi.list(client.id),
      ]);
      setProxies(proxyRes.data.proxies || []);
      setVisitors(visitorRes.data.visitors || []);
    } catch {
      setProxies([]);
      setVisitors([]);
    }
  };

  const handleCreateOrUpdateProxy = async (values: Partial<Proxy> & {
    allow_users?: string | string[];
    plugin_http_user?: string;
    plugin_http_password?: string;
    plugin_socks5_user?: string;
    plugin_socks5_password?: string;
    plugin_local_path?: string;
    plugin_strip_prefix?: string;
    plugin_unix_path?: string;
  }) => {
    if (!selectedClient) return;

    // 构建插件参数
    let pluginParams = '';
    if (values.plugin_type) {
      const params: Record<string, string> = {};
      switch (values.plugin_type) {
        case 'http_proxy':
          if (values.plugin_http_user) params.httpUser = values.plugin_http_user;
          if (values.plugin_http_password) params.httpPassword = values.plugin_http_password;
          break;
        case 'socks5':
          if (values.plugin_socks5_user) params.username = values.plugin_socks5_user;
          if (values.plugin_socks5_password) params.password = values.plugin_socks5_password;
          break;
        case 'static_file':
          if (values.plugin_local_path) params.localPath = values.plugin_local_path;
          if (values.plugin_strip_prefix) params.stripPrefix = values.plugin_strip_prefix;
          if (values.plugin_http_user) params.httpUser = values.plugin_http_user;
          if (values.plugin_http_password) params.httpPassword = values.plugin_http_password;
          break;
        case 'unix_domain_socket':
          if (values.plugin_unix_path) params.unixPath = values.plugin_unix_path;
          break;
      }
      if (Object.keys(params).length > 0) {
        pluginParams = JSON.stringify(params);
      }
    }

    // 处理 allow_users：数组转字符串
    const submitValues = {
      ...values,
      allow_users: Array.isArray(values.allow_users)
        ? (values.allow_users.length > 0 ? values.allow_users.join(',') : '*')
        : (values.allow_users || '*'),
      plugin_params: pluginParams,
    };

    // 删除临时字段
    delete (submitValues as Record<string, unknown>).plugin_http_user;
    delete (submitValues as Record<string, unknown>).plugin_http_password;
    delete (submitValues as Record<string, unknown>).plugin_socks5_user;
    delete (submitValues as Record<string, unknown>).plugin_socks5_password;
    delete (submitValues as Record<string, unknown>).plugin_local_path;
    delete (submitValues as Record<string, unknown>).plugin_strip_prefix;
    delete (submitValues as Record<string, unknown>).plugin_unix_path;

    try {
      if (editingProxy) {
        await proxyApi.update(editingProxy.id, submitValues);
        message.success('更新成功');
      } else {
        await proxyApi.create(selectedClient.id, submitValues);
        message.success('添加成功');
      }
      setProxyModalOpen(false);
      proxyForm.resetFields();
      setEditingProxy(null);
      openProxyModal(selectedClient);
      fetchClients();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleDeleteProxy = async (id: number) => {
    if (!selectedClient) return;
    try {
      await proxyApi.delete(id);
      message.success('删除成功');
      openProxyModal(selectedClient);
      fetchClients();
    } catch {
      message.error('删除失败');
    }
  };

  const openVisitorForm = async (visitor?: Visitor) => {
    if (!selectedClient) return;
    // 获取可用的代理列表（排除当前客户端的代理）
    try {
      const res = await visitorApi.getAvailableProxies(selectedClient.id);
      setAvailableProxies(res.data.proxies || []);
    } catch {
      setAvailableProxies([]);
    }
    if (visitor) {
      setEditingVisitor(visitor);
      setSelectedProxyId(visitor.source_proxy_id || null);
      visitorForm.setFieldsValue(visitor);
    } else {
      setEditingVisitor(null);
      setSelectedProxyId(null);
      visitorForm.resetFields();
      visitorForm.setFieldsValue({ bind_addr: '127.0.0.1', type: 'stcp' });
    }
    setVisitorModalOpen(true);
  };

  const handleCreateOrUpdateVisitor = async (values: Partial<Visitor>) => {
    if (!selectedClient) return;
    try {
      if (editingVisitor) {
        await visitorApi.update(editingVisitor.id, values);
        message.success('更新成功');
      } else {
        await visitorApi.create(selectedClient.id, values);
        message.success('添加成功');
      }
      setVisitorModalOpen(false);
      visitorForm.resetFields();
      setEditingVisitor(null);
      setSelectedProxyId(null);
      openProxyModal(selectedClient);
      fetchClients();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleDeleteVisitor = async (id: number) => {
    if (!selectedClient) return;
    try {
      await visitorApi.delete(id);
      message.success('删除成功');
      openProxyModal(selectedClient);
      fetchClients();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSelectAvailableProxy = (proxyId: number | undefined) => {
    if (!proxyId) {
      setSelectedProxyId(null);
      visitorForm.setFieldsValue({
        type: 'stcp',
        server_name: undefined,
        secret_key: undefined,
        source_proxy_id: undefined,
      });
      return;
    }
    const proxy = availableProxies.find(p => p.id === proxyId);
    if (proxy) {
      setSelectedProxyId(proxyId);
      visitorForm.setFieldsValue({
        name: `visit-${proxy.name}-${generateRandomString(4)}`,
        type: proxy.type,
        server_name: proxy.server_name,
        secret_key: proxy.secret_key,
        bind_port: proxy.local_port,
        source_proxy_id: proxy.id,
      });
    }
  };

  // 配置名称变化时自动生成 user
  const handleClientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    if (!editingClient && name) {
      const currentUser = form.getFieldValue('user');
      // 只在 user 为空或是自动生成的格式时才更新
      if (!currentUser || currentUser.match(/-[a-z0-9]{4,6}$/)) {
        form.setFieldsValue({ user: nameToClientId(name) });
      }
    }
  };

  // 代理端口变化时自动生成名称
  const handleProxyPortChange = (port: number | null) => {
    if (!editingProxy && port) {
      const currentName = proxyForm.getFieldValue('name');
      const currentType = proxyForm.getFieldValue('type') || 'tcp';
      // 只在名称为空时自动填充
      if (!currentName) {
        proxyForm.setFieldsValue({ name: portToProxyName(port, currentType) });
      }
    }
  };

  // 生成新的随机密钥
  const regenerateSecretKey = () => {
    proxyForm.setFieldsValue({ secret_key: generateSecretKey() });
  };

  // 获取可用端口列表
  const fetchPortPool = async () => {
    try {
      const res = await portPoolApi.getAvailablePorts();
      setPortPoolInfo(res.data);
      return res.data;
    } catch {
      setPortPoolInfo(null);
      return null;
    }
  };

  // frpc 在线管理
  const fetchFrpcStatus = async () => {
    if (!selectedClient) return;
    setFrpcStatusLoading(true);
    try {
      const res = await clientApi.getFrpcStatus(selectedClient.id);
      setFrpcStatus(res.data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '获取 frpc 状态失败');
      setFrpcStatus(null);
    } finally {
      setFrpcStatusLoading(false);
    }
  };

  const handleFrpcReload = async () => {
    if (!selectedClient) return;
    try {
      await clientApi.reloadFrpc(selectedClient.id);
      message.success('配置已重载');
      fetchFrpcStatus();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '重载失败');
    }
  };

  const handleFrpcStop = async () => {
    if (!selectedClient) return;
    try {
      await clientApi.stopFrpc(selectedClient.id);
      message.success('frpc 已停止');
      setFrpcStatus(null);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '停止失败');
    }
  };

  // 自动分配端口
  const autoAssignPort = () => {
    if (portPoolInfo && portPoolInfo.ports.length > 0) {
      proxyForm.setFieldsValue({ remote_port: portPoolInfo.ports[0] });
    } else {
      message.warning('端口池中没有可用端口，请在系统设置中配置');
    }
  };

  // 生成单个代理的配置并复制
  const copyProxyConfig = async (proxy: Proxy) => {
    let config = `[[proxies]]\nname = "${proxy.name}"\ntype = "${proxy.type}"\n`;
    if (proxy.local_ip) {
      config += `localIP = "${proxy.local_ip}"\n`;
    }
    if (proxy.local_port) {
      config += `localPort = ${proxy.local_port}\n`;
    }
    if (proxy.type === 'tcp' || proxy.type === 'udp') {
      config += `remotePort = ${proxy.remote_port}\n`;
    }
    if (proxy.type === 'stcp' || proxy.type === 'xtcp' || proxy.type === 'sudp') {
      if (proxy.secret_key) {
        config += `secretKey = "${proxy.secret_key}"\n`;
      }
      // 处理 allowUsers
      const allowUsers = proxy.allow_users || '*';
      if (allowUsers === '*') {
        config += `allowUsers = ["*"]\n`;
      } else {
        const users = allowUsers.split(',').map(u => `"${u.trim()}"`).join(', ');
        config += `allowUsers = [${users}]\n`;
      }
    }
    try {
      await copyToClipboard(config);
      message.success('代理配置已复制');
    } catch {
      message.error('复制失败');
    }
  };

  // 生成单个访问的配置并复制
  const copyVisitorConfig = async (visitor: Visitor) => {
    let config = `[[visitors]]\nname = "${visitor.name}"\ntype = "${visitor.type}"\n`;
    // 解析 server_name：如果包含 "." 则拆分为 serverUser + serverName
    const sn = visitor.server_name || '';
    if (sn.includes('.')) {
      const dotIdx = sn.indexOf('.');
      config += `serverName = "${sn.substring(dotIdx + 1)}"\n`;
      config += `serverUser = "${sn.substring(0, dotIdx)}"\n`;
    } else {
      config += `serverName = "${sn}"\n`;
    }
    if (visitor.secret_key) {
      config += `secretKey = "${visitor.secret_key}"\n`;
    }
    if (visitor.bind_addr) {
      config += `bindAddr = "${visitor.bind_addr}"\n`;
    }
    if (visitor.bind_port) {
      config += `bindPort = ${visitor.bind_port}\n`;
    }
    try {
      await copyToClipboard(config);
      message.success('访问配置已复制');
    } catch {
      message.error('复制失败');
    }
  };

  const columns = [
    { title: '配置名称', dataIndex: 'name', key: 'name' },
    {
      title: '用户标识',
      dataIndex: 'user',
      key: 'user',
      render: (user: string) => <code>{user}</code>,
    },
    {
      title: '代理/访问',
      key: 'proxies',
      render: (_: unknown, record: FrpcConfig) => {
        const proxyCount = record.proxies?.length || 0;
        const visitorCount = record.visitors?.length || 0;
        return (
          <Space>
            {proxyCount > 0 ? (
              <Tag color="blue">{proxyCount} 个代理</Tag>
            ) : (
              <Tag>无代理</Tag>
            )}
            {visitorCount > 0 && (
              <Tag color="green">{visitorCount} 个访问</Tag>
            )}
          </Space>
        );
      },
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: FrpcConfig) => (
        <Space>
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={() => openProxyModal(record)}
          >
            配置
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record)}
          >
            下载
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingClient(record);
              form.setFieldsValue(record);
              setModalOpen(true);
            }}
          />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const proxyColumns = [
    { title: '代理名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color="blue">{type.toUpperCase()}</Tag>,
    },
    {
      title: '本地地址',
      key: 'local',
      render: (_: unknown, r: Proxy) => <code>{r.local_ip}:{r.local_port}</code>,
    },
    {
      title: '远程端口 / 密钥',
      key: 'remote',
      render: (_: unknown, r: Proxy) => {
        if (r.type === 'tcp' || r.type === 'udp') {
          return r.remote_port === 0 ? <Tag>随机</Tag> : <code>{r.remote_port}</code>;
        }
        return r.secret_key ? <Tag color="green">已设置密钥</Tag> : <Tag color="red">未设置</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Proxy) => (
        <Space>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => copyProxyConfig(record)}
            title="复制配置"
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={async () => {
              setEditingProxy(record);
              // 将 allow_users 字符串转为数组供 Select 使用
              const allowUsersArray = record.allow_users && record.allow_users !== '*'
                ? record.allow_users.split(',').filter(u => u.trim())
                : [];
              proxyForm.setFieldsValue({ ...record, allow_users: allowUsersArray });
              setProxyType(record.type);
              setHealthCheckType(record.health_check_type || '');
              setPluginType(record.plugin_type || '');
              await fetchPortPool();
              setProxyModalOpen(true);
            }}
          />
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteProxy(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const visitorColumns = [
    { title: '访问名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color="green">{type.toUpperCase()}</Tag>,
    },
    {
      title: '目标服务',
      dataIndex: 'server_name',
      key: 'server_name',
      render: (name: string) => <code>{name}</code>,
    },
    {
      title: '本地绑定',
      key: 'bind',
      render: (_: unknown, r: Visitor) => <code>{r.bind_addr}:{r.bind_port}</code>,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Visitor) => (
        <Space>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => copyVisitorConfig(record)}
            title="复制配置"
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openVisitorForm(record)}
          />
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteVisitor(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>客户端管理</h2>

      <Alert
        message="使用说明"
        description="1. 新建客户端配置 → 2. 添加代理（提供服务）或访问（连接其他服务）→ 3. 下载配置文件 → 4. 在客户端机器上运行 frpc -c 配置文件"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        closable
      />

      <Card
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingClient(null);
              form.resetFields();
              // 设置管理账号默认值
              form.setFieldsValue({
                admin_user: 'admin',
                admin_pass: generateSecretKey(),
              });
              setModalOpen(true);
            }}
          >
            新建配置
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={clients}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: <Empty description="暂无客户端配置，点击右上角新建" /> }}
        />
      </Card>

      {/* 客户端配置表单 */}
      <Modal
        title={editingClient ? '编辑配置' : '新建配置'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
          setEditingClient(null);
        }}
        onOk={() => form.submit()}
        okText={editingClient ? '保存' : '下一步：添加配置'}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate}>
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
            extra="便于识别的名称，仅在管理界面显示"
          >
            <Input placeholder="如：办公室服务器、家里NAS" onChange={handleClientNameChange} />
          </Form.Item>
          <Form.Item
            name="user"
            label="用户标识"
            rules={[
              { required: true, message: '请输入用户标识' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线、横线' }
            ]}
            extra="唯一标识，根据名称自动生成。作为代理名称前缀（如 user.ssh），也用于 allowUsers 访问控制"
          >
            <Input placeholder="自动生成，或手动输入如：alice、office-pc" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选，记录用途或其他信息" />
          </Form.Item>

          <Collapse
            size="small"
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'admin',
                label: 'frpc 在线管理（可选）',
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      name="admin_enabled"
                      valuePropName="checked"
                      extra="启用后可通过管理界面直接控制 frpc（查看状态、重载配置、停止）"
                    >
                      <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                    </Form.Item>
                    <Form.Item
                      name="admin_port"
                      label="本地管理端口"
                      extra="frpc webServer 监听端口，留空默认 7400"
                    >
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="7400" />
                    </Form.Item>
                    <Form.Item name="admin_user" label="管理用户名" extra="已自动填充默认值，可修改">
                      <Input placeholder="admin" />
                    </Form.Item>
                    <Form.Item name="admin_pass" label="管理密码" extra="已自动生成随机密码，可修改">
                      <Input.Password placeholder="自动生成" />
                    </Form.Item>
                    <Alert
                      type="info"
                      showIcon
                      message="启用后系统会自动生成 frpc-admin 代理，将管理端口映射到 frps 服务器"
                      style={{ marginTop: 8 }}
                    />
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      {/* 代理/访问管理弹窗 */}
      <Modal
        title={
          <span>
            配置管理 - <strong>{selectedClient?.name}</strong>
            <span style={{ fontWeight: 'normal', color: '#888', marginLeft: 8 }}>
              ({selectedClient?.user})
            </span>
          </span>
        }
        open={!!selectedClient}
        onCancel={() => { setSelectedClient(null); setFrpcStatus(null); }}
        footer={<Button onClick={() => { setSelectedClient(null); setFrpcStatus(null); }}>关闭</Button>}
        width={950}
      >
        <Tabs
          items={[
            {
              key: 'proxies',
              label: `代理 (${proxies.length})`,
              children: (
                <>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#666' }}>
                      提供服务：将本机的服务映射到公网，供其他人访问
                    </span>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={async () => {
                        setEditingProxy(null);
                        proxyForm.resetFields();
                        setProxyType('tcp');
                        // 获取可用端口
                        const poolInfo = await fetchPortPool();
                        // 自动分配第一个可用端口
                        const autoPort = poolInfo?.ports?.[0] || 0;
                        proxyForm.setFieldsValue({ local_ip: '127.0.0.1', type: 'tcp', remote_port: autoPort, allow_users: '*' });
                        setProxyModalOpen(true);
                      }}
                    >
                      添加代理
                    </Button>
                  </div>
                  {proxies.length === 0 ? (
                    <Empty description="暂无代理配置" />
                  ) : (
                    <Table
                      columns={proxyColumns}
                      dataSource={proxies}
                      rowKey="id"
                      size="small"
                      pagination={false}
                    />
                  )}
                </>
              ),
            },
            {
              key: 'visitors',
              label: `访问 (${visitors.length})`,
              children: (
                <>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#666' }}>
                      访问服务：连接其他客户端提供的 STCP/XTCP/SUDP 代理
                    </span>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openVisitorForm()}
                    >
                      添加访问
                    </Button>
                  </div>
                  {visitors.length === 0 ? (
                    <Empty description="暂无访问配置" />
                  ) : (
                    <Table
                      columns={visitorColumns}
                      dataSource={visitors}
                      rowKey="id"
                      size="small"
                      pagination={false}
                    />
                  )}
                </>
              ),
            },
            {
              key: 'management',
              label: '在线管理',
              children: (
                <>
                  {!selectedClient?.admin_enabled ? (
                    <Alert
                      type="warning"
                      showIcon
                      message="未启用在线管理"
                      description="请编辑此客户端配置，在「frpc 在线管理」中启用后，才能使用在线管理功能。配置后需要重新下载并部署配置文件。"
                      style={{ marginBottom: 16 }}
                    />
                  ) : (
                    <>
                      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#666' }}>
                          本地端口: {selectedClient?.admin_port || 7400} |
                          远程映射端口: {selectedClient?.admin_remote_port || '未分配'}
                        </span>
                        <Space>
                          <Button onClick={fetchFrpcStatus} loading={frpcStatusLoading}>
                            刷新状态
                          </Button>
                          <Popconfirm title="确定要重载配置吗？" onConfirm={handleFrpcReload}>
                            <Button type="primary">重载配置</Button>
                          </Popconfirm>
                          <Popconfirm
                            title="确定要停止 frpc 吗？"
                            description="停止后将无法通过此界面远程重启，需要到目标机器上手动启动 frpc"
                            onConfirm={handleFrpcStop}
                            okText="确定停止"
                            okButtonProps={{ danger: true }}
                          >
                            <Button danger>停止 frpc</Button>
                          </Popconfirm>
                        </Space>
                      </div>
                      {frpcStatus ? (
                        <div>
                          {['tcp', 'udp', 'http', 'https', 'stcp', 'xtcp', 'sudp'].map(type => {
                            const items = frpcStatus[type] as Array<{ name: string; status: string; local_addr?: string; remote_addr?: string; err?: string }> || [];
                            if (items.length === 0) return null;
                            return (
                              <Card key={type} size="small" title={`${type.toUpperCase()} (${items.length})`} style={{ marginBottom: 8 }}>
                                <Table
                                  size="small"
                                  pagination={false}
                                  dataSource={items}
                                  rowKey="name"
                                  columns={[
                                    { title: '名称', dataIndex: 'name', key: 'name' },
                                    {
                                      title: '状态',
                                      dataIndex: 'status',
                                      key: 'status',
                                      render: (status: string) => (
                                        <Tag color={status === 'running' ? 'success' : 'error'}>
                                          {status === 'running' ? '运行中' : status}
                                        </Tag>
                                      ),
                                    },
                                    { title: '本地地址', dataIndex: 'local_addr', key: 'local_addr' },
                                    { title: '远程地址', dataIndex: 'remote_addr', key: 'remote_addr' },
                                    { title: '错误', dataIndex: 'err', key: 'err', render: (err: string) => err && <span style={{ color: 'red' }}>{err}</span> },
                                  ]}
                                />
                              </Card>
                            );
                          })}
                          {Object.values(frpcStatus).every(arr => (arr as unknown[]).length === 0) && (
                            <Empty description="暂无代理" />
                          )}
                        </div>
                      ) : (
                        <Empty description="点击「刷新状态」获取 frpc 代理状态" />
                      )}
                    </>
                  )}
                </>
              ),
            },
          ]}
        />
      </Modal>

      {/* 代理表单 */}
      <Modal
        title={editingProxy ? '编辑代理' : '添加代理'}
        open={proxyModalOpen}
        onCancel={() => {
          setProxyModalOpen(false);
          proxyForm.resetFields();
          setEditingProxy(null);
          setProxyType('tcp');
          setHealthCheckType('');
          setPluginType('');
        }}
        onOk={() => proxyForm.submit()}
      >
        <Form form={proxyForm} layout="vertical" onFinish={handleCreateOrUpdateProxy}>
          <Form.Item
            name="name"
            label="代理名称"
            rules={[
              { required: true, message: '请输入代理名称' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线、横线' }
            ]}
            extra="根据端口自动识别常用服务（如22→ssh），可手动修改"
          >
            <Input placeholder="输入端口后自动填充，或手动输入" />
          </Form.Item>
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select
              options={proxyTypes.map((t) => ({
                label: `${t.label} - ${t.desc}`,
                value: t.value,
              }))}
              onChange={(val) => {
                setProxyType(val);
                // 切换到安全类型时自动生成密钥
                if ((val === 'stcp' || val === 'xtcp' || val === 'sudp') && !editingProxy) {
                  const currentKey = proxyForm.getFieldValue('secret_key');
                  if (!currentKey) {
                    proxyForm.setFieldsValue({ secret_key: generateSecretKey() });
                  }
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="local_ip"
            label="本地IP"
            rules={[
              { pattern: /^(\d{1,3}\.){3}\d{1,3}$|^localhost$/, message: '请输入有效的IP地址' }
            ]}
            extra="要映射的内网服务地址，通常是 127.0.0.1"
          >
            <Input placeholder="127.0.0.1" />
          </Form.Item>
          <Form.Item
            name="local_port"
            label="本地端口"
            rules={[{ required: true, message: '请输入本地端口' }]}
            extra="内网服务的端口，如 SSH 是 22，MySQL 是 3306（会自动识别并填充代理名称）"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="如：22、3306、80" onChange={handleProxyPortChange} />
          </Form.Item>

          {/* TCP/UDP 显示远程端口 */}
          {(proxyType === 'tcp' || proxyType === 'udp') && (
            <Form.Item
              name="remote_port"
              label="远程端口"
              extra={
                portPoolInfo ? (
                  <span>
                    端口池: {portPoolInfo.pool_start}-{portPoolInfo.pool_end}，
                    可用 {portPoolInfo.ports.length} 个
                    {portPoolInfo.ports.length === 0 && '（请在系统设置中配置端口池）'}
                  </span>
                ) : '公网访问端口，0 表示由服务器随机分配'
              }
            >
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  style={{ width: '100%' }}
                  showSearch
                  placeholder="选择或输入端口"
                  value={proxyForm.getFieldValue('remote_port')}
                  onChange={(val) => proxyForm.setFieldsValue({ remote_port: val })}
                  options={[
                    { label: '0 - 由服务器随机分配', value: 0 },
                    ...(portPoolInfo?.ports || []).map(p => ({ label: String(p), value: p })),
                  ]}
                  filterOption={(input, option) =>
                    String(option?.value).includes(input)
                  }
                />
                <Button onClick={autoAssignPort} title="自动分配下一个可用端口">
                  自动
                </Button>
              </Space.Compact>
            </Form.Item>
          )}

          {/* STCP/XTCP/SUDP 显示密钥和允许用户 */}
          {(proxyType === 'stcp' || proxyType === 'xtcp' || proxyType === 'sudp') && (
            <>
              <Form.Item
                name="secret_key"
                label="访问密钥"
                rules={[
                  { required: true, message: '请输入访问密钥' },
                  { pattern: /^[\x20-\x7E]+$/, message: '只能包含英文字符和符号' }
                ]}
                extra="已自动生成随机密钥，可手动修改。访问端需要提供相同的密钥"
              >
                <Input.Password
                  placeholder="自动生成的安全密钥"
                  addonAfter={
                    <ReloadOutlined onClick={regenerateSecretKey} style={{ cursor: 'pointer' }} title="重新生成" />
                  }
                />
              </Form.Item>
              <Form.Item
                name="allow_users"
                label="允许访问的用户"
                extra="选择允许访问此代理的用户（基于客户端的「用户标识」字段）"
              >
                <Select
                  placeholder="不选则允许所有用户 (*)"
                  allowClear
                  mode="tags"
                  tokenSeparators={[',']}
                  options={
                    Array.from(new Set(clients.map(c => c.user).filter(u => u && u.trim()))).map(u => ({
                      label: u,
                      value: u,
                    }))
                  }
                />
              </Form.Item>
              <Alert
                type="info"
                showIcon
                message={`${proxyType.toUpperCase()} 使用说明`}
                description="添加代理后，需要在访问端客户端配置中添加「访问」来连接此服务"
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          <Divider style={{ margin: '16px 0 8px' }}>高级配置</Divider>
          <Collapse
            size="small"
            items={[
              {
                key: 'transport',
                label: '传输选项（所有类型）',
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      name="bandwidth_limit"
                      label="带宽限制"
                      extra="限制此代理的带宽，如 1MB、500KB，留空不限制"
                    >
                      <Input placeholder="如：1MB、500KB" />
                    </Form.Item>
                    <Form.Item
                      name="bandwidth_limit_mode"
                      label="带宽限制模式"
                    >
                      <Select
                        allowClear
                        placeholder="选择限制模式"
                        options={[
                          { value: 'client', label: '客户端限制' },
                          { value: 'server', label: '服务端限制' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      name="use_encryption"
                      label="加密传输"
                      valuePropName="checked"
                      extra="启用后数据将被加密传输"
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="use_compression"
                      label="压缩传输"
                      valuePropName="checked"
                      extra="启用后数据将被压缩，可减少带宽占用"
                    >
                      <Switch />
                    </Form.Item>
                  </>
                ),
              },
              // 健康检查：tcp, stcp, xtcp, sudp 支持，udp 不支持
              ...(proxyType !== 'udp' ? [{
                key: 'health',
                label: '健康检查（TCP/STCP/XTCP/SUDP）',
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      name="health_check_type"
                      label="检查类型"
                      extra="启用后 frpc 会定期检查本地服务状态，连续失败会自动下线代理"
                    >
                      <Select
                        allowClear
                        placeholder="选择检查类型"
                        onChange={(val) => setHealthCheckType(val || '')}
                        options={healthCheckTypes.map(t => ({
                          label: t.desc ? `${t.label} - ${t.desc}` : t.label,
                          value: t.value,
                        }))}
                      />
                    </Form.Item>
                    {healthCheckType && (
                      <>
                        <Form.Item
                          name="health_check_interval_seconds"
                          label="检查间隔（秒）"
                        >
                          <InputNumber min={1} max={3600} placeholder="10" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                          name="health_check_timeout_seconds"
                          label="超时时间（秒）"
                        >
                          <InputNumber min={1} max={60} placeholder="3" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                          name="health_check_max_failed"
                          label="最大失败次数"
                          extra="连续失败达到此次数后，代理将被下线"
                        >
                          <InputNumber min={1} max={100} placeholder="3" style={{ width: '100%' }} />
                        </Form.Item>
                        {healthCheckType === 'http' && (
                          <Form.Item
                            name="health_check_path"
                            label="检查路径"
                            extra="HTTP GET 请求的路径，返回 2xx 表示健康"
                          >
                            <Input placeholder="/health" />
                          </Form.Item>
                        )}
                      </>
                    )}
                  </>
                ),
              }] : []),
              // 插件：只有 tcp 支持
              ...(proxyType === 'tcp' ? [{
                key: 'plugin',
                label: '插件配置（仅 TCP）',
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      name="plugin_type"
                      label="插件类型"
                      extra="使用插件时，本地IP和端口配置将被忽略"
                    >
                      <Select
                        allowClear
                        placeholder="选择插件（可选）"
                        onChange={(val) => setPluginType(val || '')}
                        options={pluginTypes.map(t => ({
                          label: t.desc ? `${t.label} - ${t.desc}` : t.label,
                          value: t.value,
                        }))}
                      />
                    </Form.Item>
                    {pluginType === 'http_proxy' && (
                      <>
                        <Form.Item name={['plugin_http_user']} label="HTTP 用户名">
                          <Input placeholder="可选，用于 HTTP 基础认证" />
                        </Form.Item>
                        <Form.Item name={['plugin_http_password']} label="HTTP 密码">
                          <Input.Password placeholder="可选" />
                        </Form.Item>
                      </>
                    )}
                    {pluginType === 'socks5' && (
                      <>
                        <Form.Item name={['plugin_socks5_user']} label="SOCKS5 用户名">
                          <Input placeholder="可选，用于认证" />
                        </Form.Item>
                        <Form.Item name={['plugin_socks5_password']} label="SOCKS5 密码">
                          <Input.Password placeholder="可选" />
                        </Form.Item>
                      </>
                    )}
                    {pluginType === 'static_file' && (
                      <>
                        <Form.Item
                          name={['plugin_local_path']}
                          label="本地路径"
                          rules={[{ required: true, message: '请输入文件路径' }]}
                        >
                          <Input placeholder="/var/www/html" />
                        </Form.Item>
                        <Form.Item name={['plugin_strip_prefix']} label="去除前缀">
                          <Input placeholder="可选，如 static" />
                        </Form.Item>
                        <Form.Item name={['plugin_http_user']} label="HTTP 用户名">
                          <Input placeholder="可选，用于认证" />
                        </Form.Item>
                        <Form.Item name={['plugin_http_password']} label="HTTP 密码">
                          <Input.Password placeholder="可选" />
                        </Form.Item>
                      </>
                    )}
                    {pluginType === 'unix_domain_socket' && (
                      <Form.Item
                        name={['plugin_unix_path']}
                        label="Unix Socket 路径"
                        rules={[{ required: true, message: '请输入 Socket 路径' }]}
                      >
                        <Input placeholder="/var/run/docker.sock" />
                      </Form.Item>
                    )}
                  </>
                ),
              }] : []),
            ]}
          />
        </Form>
      </Modal>

      {/* 访问者表单 */}
      <Modal
        title={editingVisitor ? '编辑访问' : '添加访问'}
        open={visitorModalOpen}
        onCancel={() => {
          setVisitorModalOpen(false);
          visitorForm.resetFields();
          setEditingVisitor(null);
          setSelectedProxyId(null);
        }}
        onOk={() => visitorForm.submit()}
      >
        <Form form={visitorForm} layout="vertical" onFinish={handleCreateOrUpdateVisitor}>
          {availableProxies.length > 0 && !editingVisitor && (
            <Form.Item
              label="选择已有代理"
              extra="选择后自动填充所有配置，包括名称、类型、密钥和端口"
            >
              <Select
                placeholder="选择要访问的代理（推荐）"
                allowClear
                onChange={handleSelectAvailableProxy}
                options={availableProxies.map((p) => ({
                  label: `${p.client_name} - ${p.name} (${p.type.toUpperCase()})`,
                  value: p.id,
                }))}
              />
            </Form.Item>
          )}
          {availableProxies.length === 0 && !editingVisitor && (
            <Alert
              type="warning"
              showIcon
              message="暂无可访问的代理"
              description="请先在其他客户端配置中添加 STCP/XTCP/SUDP 类型的代理"
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item
            name="name"
            label="访问名称"
            rules={[
              { required: true, message: '请输入访问名称' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线、横线' }
            ]}
            extra="选择代理后自动生成，可手动修改"
          >
            <Input placeholder="选择代理后自动填充，或手动输入" />
          </Form.Item>
          {/* 选择了代理后，这些字段显示为只读 */}
          {selectedProxyId ? (
            <>
              <Form.Item name="type" label="类型">
                <Select options={visitorTypes} disabled />
              </Form.Item>
              <Form.Item name="server_name" label="目标服务名">
                <Input disabled />
              </Form.Item>
              <Form.Item name="secret_key" label="访问密钥">
                <Input.Password disabled />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="type"
                label="类型"
                rules={[{ required: true, message: '请选择类型' }]}
              >
                <Select options={visitorTypes} />
              </Form.Item>
              <Form.Item
                name="server_name"
                label="目标服务名"
                rules={[
                  { required: true, message: '请输入目标服务名' },
                  { pattern: /^[a-zA-Z0-9_.-]+$/, message: '只能包含字母、数字、下划线、横线、点号' }
                ]}
                extra="要访问的代理的完整名称，格式：user.proxyName 或 proxyName"
              >
                <Input placeholder="如：user1.ssh 或 ssh" />
              </Form.Item>
              <Form.Item
                name="secret_key"
                label="访问密钥"
                rules={[
                  { required: true, message: '请输入访问密钥' },
                  { pattern: /^[\x20-\x7E]+$/, message: '只能包含英文字符和符号' }
                ]}
                extra="与目标代理设置的密钥相同"
              >
                <Input.Password placeholder="输入目标代理的密钥" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="bind_addr"
            label="绑定地址"
            rules={[
              { pattern: /^(\d{1,3}\.){3}\d{1,3}$|^localhost$|^0\.0\.0\.0$/, message: '请输入有效的IP地址' }
            ]}
            extra="本地监听地址，通常是 127.0.0.1"
          >
            <Input placeholder="127.0.0.1" />
          </Form.Item>
          <Form.Item
            name="bind_port"
            label="绑定端口"
            rules={[{ required: true, message: '请输入绑定端口' }]}
            extra="选择代理后自动使用目标服务的端口，可手动修改"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="自动填充或手动输入" />
          </Form.Item>
          <Form.Item name="source_proxy_id" hidden>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
