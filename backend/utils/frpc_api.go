package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// FrpcClient 用于调用 frpc webServer API
type FrpcClient struct {
	baseURL  string
	username string
	password string
	client   *http.Client
}

// FrpcProxyStatus 代理状态
type FrpcProxyStatus struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	Status     string `json:"status"`
	Err        string `json:"err"`
	LocalAddr  string `json:"local_addr"`
	Plugin     string `json:"plugin"`
	RemoteAddr string `json:"remote_addr"`
}

// FrpcStatusResponse frpc status 响应
type FrpcStatusResponse struct {
	TCP   []FrpcProxyStatus `json:"tcp"`
	UDP   []FrpcProxyStatus `json:"udp"`
	HTTP  []FrpcProxyStatus `json:"http"`
	HTTPS []FrpcProxyStatus `json:"https"`
	STCP  []FrpcProxyStatus `json:"stcp"`
	XTCP  []FrpcProxyStatus `json:"xtcp"`
	SUDP  []FrpcProxyStatus `json:"sudp"`
}

// NewFrpcClient 创建 frpc API 客户端
func NewFrpcClient(addr string, port int, username, password string) *FrpcClient {
	return &FrpcClient{
		baseURL:  fmt.Sprintf("http://%s:%d/api", addr, port),
		username: username,
		password: password,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *FrpcClient) doRequest(method, path string, body []byte) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, c.baseURL+path, reqBody)
	if err != nil {
		return nil, err
	}

	if c.username != "" && c.password != "" {
		req.SetBasicAuth(c.username, c.password)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/toml")
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return io.ReadAll(resp.Body)
}

// GetStatus 获取 frpc 代理状态
func (c *FrpcClient) GetStatus() (*FrpcStatusResponse, error) {
	data, err := c.doRequest("GET", "/status", nil)
	if err != nil {
		return nil, err
	}

	var status FrpcStatusResponse
	if err := json.Unmarshal(data, &status); err != nil {
		return nil, err
	}

	return &status, nil
}

// GetConfig 获取当前配置
func (c *FrpcClient) GetConfig() (string, error) {
	data, err := c.doRequest("GET", "/config", nil)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// UpdateConfig 更新配置（推送新配置到 frpc）
func (c *FrpcClient) UpdateConfig(tomlContent string) error {
	_, err := c.doRequest("PUT", "/config", []byte(tomlContent))
	return err
}

// Reload 热重载 frpc 配置
func (c *FrpcClient) Reload() error {
	_, err := c.doRequest("GET", "/reload", nil)
	return err
}

// Stop 停止 frpc
func (c *FrpcClient) Stop() error {
	_, err := c.doRequest("POST", "/stop", nil)
	return err
}
