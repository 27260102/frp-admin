import { useEffect, useState } from 'react';
import { Card, Button, Space, message, Spin, Input, Tag, Popconfirm, Form, InputNumber, Switch, Tabs, Divider } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { frpsApi } from '../api';
import type { FrpsStatus } from '../types';

const { TextArea } = Input;

export default function ServerConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<FrpsStatus | null>(null);
  const [config, setConfig] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('form');
  const [form] = Form.useForm();

  const fetchStatus = async () => {
    try {
      const res = await frpsApi.getStatus();
      setStatus(res.data);
    } catch {
      message.error('获取状态失败');
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await frpsApi.getConfig();
      setConfig(res.data.config);
      // 解析配置填充表单
      parseConfigToForm(res.data.config);
    } catch {
      // 配置文件可能不存在
    }
  };

  const parseConfigToForm = (configText: string) => {
    const values: Record<string, unknown> = {
      bindAddr: '0.0.0.0',
      bindPort: 7000,
      authMethod: 'token',
      authToken: '',
      webServerAddr: '127.0.0.1',
      webServerPort: 7500,
      webServerUser: 'admin',
      webServerPassword: 'admin',
      logTo: './frps.log',
      logLevel: 'info',
      logMaxDays: 3,
      tlsForce: false,
    };

    const lines = configText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([a-zA-Z.]+)\s*=\s*(.+)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      const value = rawValue.replace(/^["']|["']$/g, '');

      switch (key) {
        case 'bindAddr': values.bindAddr = value; break;
        case 'bindPort': values.bindPort = parseInt(value); break;
        case 'auth.method': values.authMethod = value; break;
        case 'auth.token': values.authToken = value; break;
        case 'webServer.addr': values.webServerAddr = value; break;
        case 'webServer.port': values.webServerPort = parseInt(value); break;
        case 'webServer.user': values.webServerUser = value; break;
        case 'webServer.password': values.webServerPassword = value; break;
        case 'log.to': values.logTo = value; break;
        case 'log.level': values.logLevel = value; break;
        case 'log.maxDays': values.logMaxDays = parseInt(value); break;
        case 'transport.tls.force': values.tlsForce = value === 'true'; break;
      }
    }

    form.setFieldsValue(values);
  };

  const generateConfigFromForm = (values: Record<string, unknown>): string => {
    return `# FRP Server Configuration

bindAddr = "${values.bindAddr}"
bindPort = ${values.bindPort}

# Dashboard / WebServer
webServer.addr = "${values.webServerAddr}"
webServer.port = ${values.webServerPort}
webServer.user = "${values.webServerUser}"
webServer.password = "${values.webServerPassword}"

# Logging
log.to = "${values.logTo}"
log.level = "${values.logLevel}"
log.maxDays = ${values.logMaxDays}

# Authentication
auth.method = "${values.authMethod}"
auth.token = "${values.authToken}"

# TLS
transport.tls.force = ${values.tlsForce}
`;
  };

  const fetchLogs = async () => {
    try {
      const res = await frpsApi.getLogs();
      setLogs(res.data.logs || []);
    } catch {
      // 忽略
    }
  };

  useEffect(() => {
    Promise.all([fetchStatus(), fetchConfig(), fetchLogs()]).finally(() => setLoading(false));
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    try {
      await frpsApi.start();
      message.success('启动成功');
      fetchStatus();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '启动失败');
    }
  };

  const handleStop = async () => {
    try {
      await frpsApi.stop();
      message.success('已停止');
      fetchStatus();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '停止失败');
    }
  };

  const handleRestart = async () => {
    try {
      await frpsApi.restart();
      message.success('重启成功');
      fetchStatus();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '重启失败');
    }
  };

  const handleVerify = async (configToVerify?: string) => {
    const configContent = configToVerify || config;
    try {
      await frpsApi.verifyConfig(configContent);
      message.success('配置验证通过');
      return true;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '配置验证失败');
      return false;
    }
  };

  const handleSaveForm = async (values: Record<string, unknown>) => {
    const newConfig = generateConfigFromForm(values);
    setSaving(true);
    try {
      const valid = await handleVerify(newConfig);
      if (!valid) {
        setSaving(false);
        return;
      }
      await frpsApi.saveConfig(newConfig);
      setConfig(newConfig);
      message.success('配置保存成功');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveText = async () => {
    setSaving(true);
    try {
      await frpsApi.saveConfig(config);
      message.success('配置保存成功');
      parseConfigToForm(config);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>服务端配置</h2>

      <Card title="服务控制" style={{ marginBottom: 16 }}>
        <Space>
          <span>状态：</span>
          <Tag color={status?.running ? 'success' : 'error'}>
            {status?.running ? '运行中' : '已停止'}
          </Tag>
          {status?.running && status.uptime && (
            <span style={{ color: '#888' }}>运行时长: {status.uptime}</span>
          )}
        </Space>
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              disabled={status?.running}
            >
              启动
            </Button>
            <Popconfirm title="确定要停止服务吗？" onConfirm={handleStop}>
              <Button
                danger
                icon={<PauseCircleOutlined />}
                disabled={!status?.running}
              >
                停止
              </Button>
            </Popconfirm>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRestart}
              disabled={!status?.running}
            >
              重启
            </Button>
          </Space>
        </div>
      </Card>

      <Card
        title="配置文件 (frps.toml)"
        style={{ marginBottom: 16 }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'form',
              label: '可视化编辑',
              children: (
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleSaveForm}
                  style={{ maxWidth: 600 }}
                >
                  <Divider orientation="left">基础配置</Divider>
                  <Space style={{ display: 'flex' }} align="start">
                    <Form.Item name="bindAddr" label="绑定地址" style={{ width: 200 }}>
                      <Input placeholder="0.0.0.0" />
                    </Form.Item>
                    <Form.Item name="bindPort" label="绑定端口" style={{ width: 150 }}>
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                  </Space>

                  <Divider orientation="left">认证配置</Divider>
                  <Form.Item name="authMethod" label="认证方式" style={{ width: 200 }}>
                    <Input disabled />
                  </Form.Item>
                  <Form.Item
                    name="authToken"
                    label="认证令牌"
                    extra="客户端连接时需要提供此令牌"
                  >
                    <Input.Password placeholder="设置一个安全的令牌" />
                  </Form.Item>

                  <Divider orientation="left">Dashboard 配置</Divider>
                  <Space style={{ display: 'flex' }} align="start">
                    <Form.Item name="webServerAddr" label="监听地址" style={{ width: 200 }}>
                      <Input placeholder="127.0.0.1" />
                    </Form.Item>
                    <Form.Item name="webServerPort" label="端口" style={{ width: 150 }}>
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                  </Space>
                  <Space style={{ display: 'flex' }} align="start">
                    <Form.Item name="webServerUser" label="用户名" style={{ width: 200 }}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="webServerPassword" label="密码" style={{ width: 200 }}>
                      <Input.Password />
                    </Form.Item>
                  </Space>

                  <Divider orientation="left">日志配置</Divider>
                  <Space style={{ display: 'flex' }} align="start">
                    <Form.Item name="logTo" label="日志文件" style={{ width: 250 }}>
                      <Input placeholder="./frps.log" />
                    </Form.Item>
                    <Form.Item name="logLevel" label="日志级别" style={{ width: 120 }}>
                      <Input placeholder="info" />
                    </Form.Item>
                    <Form.Item name="logMaxDays" label="保留天数" style={{ width: 100 }}>
                      <InputNumber min={1} max={365} style={{ width: '100%' }} />
                    </Form.Item>
                  </Space>

                  <Divider orientation="left">安全配置</Divider>
                  <Form.Item name="tlsForce" label="强制 TLS" valuePropName="checked">
                    <Switch />
                  </Form.Item>

                  <Form.Item style={{ marginTop: 24 }}>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                      保存配置
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'text',
              label: 'TOML 文本编辑',
              children: (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Space>
                      <Button icon={<CheckCircleOutlined />} onClick={() => handleVerify()}>
                        验证
                      </Button>
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={saving}
                        onClick={handleSaveText}
                      >
                        保存
                      </Button>
                    </Space>
                  </div>
                  <TextArea
                    value={config}
                    onChange={(e) => setConfig(e.target.value)}
                    rows={20}
                    style={{ fontFamily: 'monospace' }}
                    placeholder="# frps.toml 配置内容"
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      <Card title="运行日志">
        <div
          style={{
            height: 300,
            overflow: 'auto',
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: 12,
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#888' }}>暂无日志</div>
          ) : (
            logs.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      </Card>
    </div>
  );
}
