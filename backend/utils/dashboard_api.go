package utils

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type DashboardClient struct {
	baseURL  string
	username string
	password string
	client   *http.Client
}

type ServerInfo struct {
	Version           string `json:"version"`
	BindPort          int    `json:"bind_port"`
	VhostHTTPPort     int    `json:"vhost_http_port"`
	VhostHTTPSPort    int    `json:"vhost_https_port"`
	TCPMuxHTTPConnectPort int `json:"tcpmux_httpconnect_port"`
	KCPBindPort       int    `json:"kcp_bind_port"`
	QUICBindPort      int    `json:"quic_bind_port"`
	SubdomainHost     string `json:"subdomain_host"`
	MaxPoolCount      int    `json:"max_pool_count"`
	MaxPortsPerClient int    `json:"max_ports_per_client"`
	HeartBeatTimeout  int    `json:"heart_beat_timeout"`
	TotalTrafficIn    int64  `json:"total_traffic_in"`
	TotalTrafficOut   int64  `json:"total_traffic_out"`
	CurConns          int    `json:"cur_conns"`
	ClientCounts      int    `json:"client_counts"`
	ProxyTypeCounts   map[string]int `json:"proxy_type_counts"`
}

type ProxyInfo struct {
	Name            string      `json:"name"`
	Conf            interface{} `json:"conf"`
	ClientVersion   string      `json:"clientVersion"`
	TodayTrafficIn  int64       `json:"todayTrafficIn"`
	TodayTrafficOut int64       `json:"todayTrafficOut"`
	CurConns        int         `json:"curConns"`
	LastStartTime   string      `json:"lastStartTime"`
	LastCloseTime   string      `json:"lastCloseTime"`
	Status          string      `json:"status"`
}

type ProxiesResponse struct {
	Proxies []ProxyInfo `json:"proxies"`
}

func NewDashboardClient(addr string, port int, username, password string) *DashboardClient {
	return &DashboardClient{
		baseURL:  fmt.Sprintf("http://%s:%d/api", addr, port),
		username: username,
		password: password,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *DashboardClient) doRequest(path string) ([]byte, error) {
	req, err := http.NewRequest("GET", c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}

	req.SetBasicAuth(c.username, c.password)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

func (c *DashboardClient) GetServerInfo() (*ServerInfo, error) {
	data, err := c.doRequest("/serverinfo")
	if err != nil {
		return nil, err
	}

	var info ServerInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}

	return &info, nil
}

func (c *DashboardClient) GetProxies(proxyType string) (*ProxiesResponse, error) {
	path := "/proxy/" + proxyType
	data, err := c.doRequest(path)
	if err != nil {
		return nil, err
	}

	var resp ProxiesResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}

	return &resp, nil
}

func (c *DashboardClient) GetAllProxies() ([]ProxyInfo, error) {
	types := []string{"tcp", "udp", "http", "https", "stcp", "sudp", "xtcp", "tcpmux"}
	var allProxies []ProxyInfo

	for _, t := range types {
		resp, err := c.GetProxies(t)
		if err != nil {
			continue // 忽略单个类型的错误
		}
		allProxies = append(allProxies, resp.Proxies...)
	}

	return allProxies, nil
}
