import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Spin, Descriptions, InputNumber, Space, Tag, Table, Collapse } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { settingsApi, frpsApi, portPoolApi, PortPoolInfo, adminPortPoolApi, AdminPortPoolInfo } from '../api';

interface FrpsConfig {
  bind_addr: string;
  bind_port: number;
  auth_method: string;
  auth_token: string;
  web_server_addr: string;
  web_server_port: number;
  web_server_user: string;
  web_server_pass: string;
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPortPool, setSavingPortPool] = useState(false);
  const [savingAdminPool, setSavingAdminPool] = useState(false);
  const [frpsConfig, setFrpsConfig] = useState<FrpsConfig | null>(null);
  const [portPoolInfo, setPortPoolInfo] = useState<PortPoolInfo | null>(null);
  const [adminPoolInfo, setAdminPoolInfo] = useState<AdminPortPoolInfo | null>(null);
  const [form] = Form.useForm();
  const [portPoolForm] = Form.useForm();
  const [adminPoolForm] = Form.useForm();

  const fetchData = async () => {
    try {
      const [settingsRes, configRes, portPoolRes, adminPoolRes] = await Promise.all([
        settingsApi.get(),
        frpsApi.getParsedConfig(),
        portPoolApi.getAvailablePorts(),
        adminPortPoolApi.getInfo(),
      ]);
      setFrpsConfig(configRes.data);
      setPortPoolInfo(portPoolRes.data);
      setAdminPoolInfo(adminPoolRes.data);
      // 设置表单值，如果没有设置过端口，使用 frps.toml 的端口作为默认值
      const settings = settingsRes.data;
      form.setFieldsValue({
        server_addr: settings.server_addr || '',
        server_port: settings.server_port ? Number(settings.server_port) : configRes.data.bind_port,
      });
      portPoolForm.setFieldsValue({
        port_pool_start: portPoolRes.data.pool_start,
        port_pool_end: portPoolRes.data.pool_end,
      });
      // 管理端口池设置
      adminPoolForm.setFieldsValue({
        admin_port_pool_start: adminPoolRes.data.pool_start,
        admin_port_pool_end: adminPoolRes.data.pool_end,
      });
    } catch {
      // 可能没有设置
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (values: { server_addr: string; server_port: number }) => {
    setSaving(true);
    try {
      await settingsApi.save({
        server_addr: values.server_addr,
        server_port: String(values.server_port),
      });
      message.success('设置保存成功');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePortPool = async (values: { port_pool_start: number; port_pool_end: number }) => {
    if (values.port_pool_end <= values.port_pool_start) {
      message.error('结束端口必须大于起始端口');
      return;
    }
    setSavingPortPool(true);
    try {
      await settingsApi.save({
        port_pool_start: String(values.port_pool_start),
        port_pool_end: String(values.port_pool_end),
      });
      message.success('端口池设置保存成功');
      fetchData(); // 刷新数据
    } catch {
      message.error('保存失败');
    } finally {
      setSavingPortPool(false);
    }
  };

  const handleSaveAdminPool = async (values: { admin_port_pool_start: number; admin_port_pool_end: number }) => {
    if (values.admin_port_pool_end <= values.admin_port_pool_start) {
      message.error('结束端口必须大于起始端口');
      return;
    }
    setSavingAdminPool(true);
    try {
      await settingsApi.save({
        admin_port_pool_start: String(values.admin_port_pool_start),
        admin_port_pool_end: String(values.admin_port_pool_end),
      });
      message.success('管理端口池设置保存成功');
      fetchData(); // 刷新数据
    } catch {
      message.error('保存失败');
    } finally {
      setSavingAdminPool(false);
    }
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>系统设置</h2>

      <Card title="服务器公网地址" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ maxWidth: 500 }}>
          <Form.Item
            name="server_addr"
            label="公网 IP / 域名"
            rules={[{ required: true, message: '请输入服务器公网地址' }]}
          >
            <Input placeholder="如 1.2.3.4 或 frp.example.com" />
          </Form.Item>

          <Form.Item
            name="server_port"
            label="公网端口"
            rules={[{ required: true, message: '请输入端口' }]}
            extra="客户端连接的端口，如有端口映射请填写映射后的端口"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="远程端口池" style={{ marginBottom: 16 }}>
        <Form form={portPoolForm} layout="vertical" onFinish={handleSavePortPool} style={{ maxWidth: 500 }}>
          <Form.Item label="端口范围" extra="TCP/UDP 代理可从此范围内分配远程端口">
            <Space>
              <Form.Item name="port_pool_start" noStyle rules={[{ required: true }]}>
                <InputNumber min={1} max={65535} placeholder="起始" style={{ width: 120 }} />
              </Form.Item>
              <span>-</span>
              <Form.Item name="port_pool_end" noStyle rules={[{ required: true }]}>
                <InputNumber min={1} max={65535} placeholder="结束" style={{ width: 120 }} />
              </Form.Item>
            </Space>
          </Form.Item>

          {portPoolInfo && (
            <Form.Item label="使用情况">
              <Space>
                <Tag color="blue">已使用: {portPoolInfo.total_used}</Tag>
                <Tag color="green">可用: {portPoolInfo.total_available}</Tag>
              </Space>
            </Form.Item>
          )}

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingPortPool}>
              保存
            </Button>
          </Form.Item>
        </Form>

        {portPoolInfo && portPoolInfo.port_usages && portPoolInfo.port_usages.length > 0 && (
          <Collapse
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'port_usages',
                label: `查看已使用端口详情 (${portPoolInfo.port_usages.length} 个)`,
                children: (
                  <Table
                    size="small"
                    dataSource={portPoolInfo.port_usages}
                    rowKey="port"
                    pagination={false}
                    columns={[
                      { title: '端口', dataIndex: 'port', key: 'port', width: 80 },
                      { title: '代理名称', dataIndex: 'proxy_name', key: 'proxy_name' },
                      {
                        title: '类型',
                        dataIndex: 'proxy_type',
                        key: 'proxy_type',
                        width: 80,
                        render: (t: string) => <Tag>{t.toUpperCase()}</Tag>,
                      },
                      { title: '所属客户端', dataIndex: 'client_name', key: 'client_name' },
                      {
                        title: '客户端用户',
                        dataIndex: 'client_user',
                        key: 'client_user',
                        render: (user: string) => <code>{user}</code>,
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card title="管理端口池" style={{ marginBottom: 16 }}>
        <Form form={adminPoolForm} layout="vertical" onFinish={handleSaveAdminPool} style={{ maxWidth: 500 }}>
          <Form.Item label="端口范围" extra="frpc 在线管理功能会从此范围内自动分配远程端口（用于映射 frpc webServer）">
            <Space>
              <Form.Item name="admin_port_pool_start" noStyle rules={[{ required: true }]}>
                <InputNumber min={1} max={65535} placeholder="起始" style={{ width: 120 }} />
              </Form.Item>
              <span>-</span>
              <Form.Item name="admin_port_pool_end" noStyle rules={[{ required: true }]}>
                <InputNumber min={1} max={65535} placeholder="结束" style={{ width: 120 }} />
              </Form.Item>
            </Space>
          </Form.Item>

          {adminPoolInfo && (
            <Form.Item label="使用情况">
              <Space>
                <Tag color="blue">已使用: {adminPoolInfo.total_used}</Tag>
                <Tag color="green">可用: {adminPoolInfo.total_available}</Tag>
              </Space>
            </Form.Item>
          )}

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingAdminPool}>
              保存
            </Button>
          </Form.Item>
        </Form>

        {adminPoolInfo && adminPoolInfo.port_usages && adminPoolInfo.port_usages.length > 0 && (
          <Collapse
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'admin_port_usages',
                label: `查看已使用端口详情 (${adminPoolInfo.port_usages.length} 个)`,
                children: (
                  <Table
                    size="small"
                    dataSource={adminPoolInfo.port_usages}
                    rowKey="port"
                    pagination={false}
                    columns={[
                      { title: '远程端口', dataIndex: 'port', key: 'port', width: 100 },
                      { title: '所属客户端', dataIndex: 'client_name', key: 'client_name' },
                      {
                        title: '客户端用户',
                        dataIndex: 'client_user',
                        key: 'client_user',
                        render: (user: string) => <code>{user}</code>,
                      },
                      { title: '本地管理端口', dataIndex: 'admin_port', key: 'admin_port', width: 120 },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="frps.toml 配置信息"
        extra={<Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>}
      >
        {frpsConfig ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="绑定地址">{frpsConfig.bind_addr}</Descriptions.Item>
            <Descriptions.Item label="绑定端口">{frpsConfig.bind_port}</Descriptions.Item>
            <Descriptions.Item label="认证方式">{frpsConfig.auth_method}</Descriptions.Item>
            <Descriptions.Item label="认证令牌">
              <span style={{ fontFamily: 'monospace' }}>
                {frpsConfig.auth_token ? '••••••••' : '(未设置)'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Dashboard 地址">
              {frpsConfig.web_server_addr}:{frpsConfig.web_server_port}
            </Descriptions.Item>
            <Descriptions.Item label="Dashboard 用户">{frpsConfig.web_server_user}</Descriptions.Item>
          </Descriptions>
        ) : (
          <div style={{ color: '#888' }}>无法读取配置文件</div>
        )}
        <div style={{ marginTop: 16, color: '#888', fontSize: 12 }}>
          以上信息从 frps.toml 自动读取，如需修改请编辑"服务端配置"页面
        </div>
      </Card>
    </div>
  );
}
