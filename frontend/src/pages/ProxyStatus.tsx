import { useEffect, useState } from 'react';
import { Card, Table, Tag, Spin, message, Empty } from 'antd';
import { dashboardApi, frpsApi } from '../api';
import type { ProxyInfo } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function ProxyStatus() {
  const [loading, setLoading] = useState(true);
  const [frpsRunning, setFrpsRunning] = useState(false);
  const [proxies, setProxies] = useState<ProxyInfo[]>([]);

  const fetchData = async () => {
    try {
      const statusRes = await frpsApi.getStatus();
      setFrpsRunning(statusRes.data.running);

      if (statusRes.data.running) {
        const proxiesRes = await dashboardApi.getProxies();
        setProxies(proxiesRes.data.proxies || []);
      }
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const columns = [
    { title: '代理名称', dataIndex: 'name', key: 'name' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'online' ? 'success' : 'error'}>
          {status === 'online' ? '在线' : '离线'}
        </Tag>
      ),
    },
    {
      title: '客户端版本',
      dataIndex: 'clientVersion',
      key: 'clientVersion',
    },
    {
      title: '当前连接',
      dataIndex: 'curConns',
      key: 'curConns',
    },
    {
      title: '今日入站',
      dataIndex: 'todayTrafficIn',
      key: 'todayTrafficIn',
      render: (val: number) => formatBytes(val),
    },
    {
      title: '今日出站',
      dataIndex: 'todayTrafficOut',
      key: 'todayTrafficOut',
      render: (val: number) => formatBytes(val),
    },
    {
      title: '最后启动',
      dataIndex: 'lastStartTime',
      key: 'lastStartTime',
    },
  ];

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>代理状态</h2>

      {!frpsRunning ? (
        <Card>
          <Empty description="frps 服务未运行，无法获取代理状态" />
        </Card>
      ) : proxies.length === 0 ? (
        <Card>
          <Empty description="暂无代理连接" />
        </Card>
      ) : (
        <Card>
          <Table
            columns={columns}
            dataSource={proxies}
            rowKey="name"
            pagination={{ pageSize: 20 }}
          />
        </Card>
      )}
    </div>
  );
}
