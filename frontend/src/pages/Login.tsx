import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, message, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authApi } from '../api';
import axios from 'axios';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // 倒计时效果
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          setRemainingAttempts(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
  }, []);

  const handleLogin = async (values: { username: string; password: string }) => {
    if (lockoutSeconds > 0) {
      message.warning(`请等待 ${formatTime(lockoutSeconds)} 后再试`);
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.login(values.username, values.password);
      localStorage.setItem('frp_token', data.token);
      setRemainingAttempts(null);
      message.success('登录成功');
      navigate('/');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const { status, data } = error.response;

        if (status === 429 && data.retry_after) {
          // 被锁定
          setLockoutSeconds(data.retry_after);
          setRemainingAttempts(0);
          message.error(data.error || '登录尝试次数过多，请稍后再试');
        } else if (data.remaining_attempts !== undefined) {
          // 登录失败，显示剩余次数
          setRemainingAttempts(data.remaining_attempts);
          message.error(`${data.error || '用户名或密码错误'}，剩余 ${data.remaining_attempts} 次尝试机会`);
        } else {
          message.error(data.error || '用户名或密码错误');
        }
      } else {
        message.error('登录失败，请检查网络连接');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    }}>
      <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 32 }}>FRP Admin</h2>

        {lockoutSeconds > 0 && (
          <Alert
            type="error"
            message="账户已被临时锁定"
            description={`由于多次登录失败，请等待 ${formatTime(lockoutSeconds)} 后再试`}
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}

        {remainingAttempts !== null && remainingAttempts > 0 && remainingAttempts <= 3 && (
          <Alert
            type="warning"
            message={`剩余 ${remainingAttempts} 次尝试机会`}
            description="多次失败后账户将被临时锁定"
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}

        <Form onFinish={handleLogin} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" disabled={lockoutSeconds > 0} />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" disabled={lockoutSeconds > 0} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block disabled={lockoutSeconds > 0}>
              {lockoutSeconds > 0 ? `请等待 ${formatTime(lockoutSeconds)}` : '登录'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
