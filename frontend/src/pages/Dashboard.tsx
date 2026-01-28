import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Spin, message } from 'antd';
import {
  CloudServerOutlined,
  TeamOutlined,
  ApiOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { frpsApi, dashboardApi, clientApi } from '../api';
import type { FrpsStatus, ServerInfo, FrpcConfig } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [frpsStatus, setFrpsStatus] = useState<FrpsStatus | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [clients, setClients] = useState<FrpcConfig[]>([]);

  const fetchData = async () => {
    try {
      const [statusRes, clientsRes] = await Promise.all([
        frpsApi.getStatus(),
        clientApi.list(),
      ]);
      setFrpsStatus(statusRes.data);
      setClients(clientsRes.data.clients || []);

      // 仅当 frps 运行时获取 Dashboard 数据
      if (statusRes.data.running) {
        try {
          const infoRes = await dashboardApi.getServerInfo();
          setServerInfo(infoRes.data);
        } catch {
          // Dashboard API 可能不可用
        }
      }
    } catch (err) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  const totalProxies = clients.reduce((sum, c) => sum + (c.proxies?.length || 0), 0);

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>仪表盘</h2>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="服务状态"
              value={frpsStatus?.running ? '运行中' : '已停止'}
              prefix={<CloudServerOutlined />}
              valueStyle={{ color: frpsStatus?.running ? '#52c41a' : '#ff4d4f' }}
            />
            {frpsStatus?.running && frpsStatus.uptime && (
              <div style={{ marginTop: 8, color: '#888' }}>
                运行时长: {frpsStatus.uptime}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="客户端配置"
              value={clients.length}
              prefix={<TeamOutlined />}
              suffix="个"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="代理总数"
              value={totalProxies}
              prefix={<ApiOutlined />}
              suffix="个"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="当前连接数"
              value={serverInfo?.cur_conns || 0}
              prefix={<SwapOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {serverInfo && (
        <>
          <h3 style={{ marginTop: 32, marginBottom: 16 }}>服务器信息</h3>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="基本信息" size="small">
                <p><strong>版本：</strong>{serverInfo.version}</p>
                <p><strong>绑定端口：</strong>{serverInfo.bind_port}</p>
                <p><strong>HTTP 端口：</strong>{serverInfo.vhost_http_port || '-'}</p>
                <p><strong>HTTPS 端口：</strong>{serverInfo.vhost_https_port || '-'}</p>
                <p><strong>子域名：</strong>{serverInfo.subdomain_host || '-'}</p>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="流量统计" size="small">
                <p><strong>总入站流量：</strong>{formatBytes(serverInfo.total_traffic_in)}</p>
                <p><strong>总出站流量：</strong>{formatBytes(serverInfo.total_traffic_out)}</p>
                <p><strong>在线客户端：</strong>{serverInfo.client_counts}</p>
                <p>
                  <strong>代理类型：</strong>
                  {serverInfo.proxy_type_counts && Object.entries(serverInfo.proxy_type_counts).map(([type, count]) => (
                    <Tag key={type} style={{ marginLeft: 4 }}>{type}: {count}</Tag>
                  ))}
                </p>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
