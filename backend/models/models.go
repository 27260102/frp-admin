package models

import (
	"time"

	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	Username  string         `gorm:"uniqueIndex;size:50" json:"username"`
	Password  string         `gorm:"size:100" json:"-"`
	IsAdmin   bool           `gorm:"default:true" json:"is_admin"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// FrpcConfig frpc客户端配置
type FrpcConfig struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	Name      string         `gorm:"size:100;not null" json:"name"`
	User      string         `gorm:"size:50;uniqueIndex;not null" json:"user"`
	Remark    string         `gorm:"size:500" json:"remark"`
	// frpc webServer 配置（用于在线管理）
	AdminEnabled      bool   `json:"admin_enabled"`                        // 是否启用在线管理
	AdminPort         int    `json:"admin_port"`                           // 本地 webServer 端口（默认7400）
	AdminUser         string `gorm:"size:50" json:"admin_user"`            // webServer 用户名
	AdminPass         string `gorm:"size:100" json:"admin_pass"`           // webServer 密码
	AdminRemotePort   int    `json:"admin_remote_port"`                    // 映射到 frps 的远程端口（自动分配）
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
	Proxies   []Proxy        `gorm:"foreignKey:FrpcConfigID" json:"proxies,omitempty"`
	Visitors  []Visitor      `gorm:"foreignKey:FrpcConfigID" json:"visitors,omitempty"`
}

// Proxy 代理配置
type Proxy struct {
	ID           uint           `gorm:"primarykey" json:"id"`
	FrpcConfigID uint           `gorm:"index;not null" json:"frpc_config_id"`
	Name         string         `gorm:"size:100;not null" json:"name"`
	Type         string         `gorm:"size:20;not null" json:"type"` // tcp, udp, stcp, xtcp, sudp
	LocalIP      string         `gorm:"size:100;default:'127.0.0.1'" json:"local_ip"`
	LocalPort    int            `json:"local_port"`
	RemotePort   int            `json:"remote_port"`   // TCP/UDP 使用
	SecretKey    string         `gorm:"size:100" json:"secret_key"` // STCP/XTCP/SUDP 使用
	AllowUsers   string         `gorm:"size:500;default:'*'" json:"allow_users"` // 允许访问的用户，* 表示所有，多个用逗号分隔

	// 传输选项
	BandwidthLimit     string `gorm:"size:20" json:"bandwidth_limit"`      // 带宽限制，如 "1MB"
	BandwidthLimitMode string `gorm:"size:10" json:"bandwidth_limit_mode"` // client 或 server
	UseEncryption      bool   `json:"use_encryption"`                      // 加密传输
	UseCompression     bool   `json:"use_compression"`                     // 压缩传输

	// 健康检查
	HealthCheckType            string `gorm:"size:10" json:"health_check_type"`              // tcp 或 http
	HealthCheckTimeoutSeconds  int    `json:"health_check_timeout_seconds"`                  // 超时时间
	HealthCheckMaxFailed       int    `json:"health_check_max_failed"`                       // 最大失败次数
	HealthCheckIntervalSeconds int    `json:"health_check_interval_seconds"`                 // 检查间隔
	HealthCheckPath            string `gorm:"size:200" json:"health_check_path"`             // HTTP检查路径

	// 插件配置
	PluginType   string `gorm:"size:50" json:"plugin_type"`   // 插件类型: http_proxy, socks5, static_file, unix_domain_socket
	PluginParams string `gorm:"type:text" json:"plugin_params"` // 插件参数 JSON

	ExtraConfig  string         `gorm:"type:text" json:"extra_config"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// Visitor 访问者配置（用于访问 STCP/XTCP/SUDP 代理）
type Visitor struct {
	ID           uint           `gorm:"primarykey" json:"id"`
	FrpcConfigID uint           `gorm:"index;not null" json:"frpc_config_id"`
	Name         string         `gorm:"size:100;not null" json:"name"`
	Type         string         `gorm:"size:20;not null" json:"type"` // stcp, xtcp, sudp
	ServerName   string         `gorm:"size:200;not null" json:"server_name"` // 要访问的代理名称
	SecretKey    string         `gorm:"size:100" json:"secret_key"`
	BindAddr     string         `gorm:"size:100;default:'127.0.0.1'" json:"bind_addr"`
	BindPort     int            `json:"bind_port"`
	SourceProxyID *uint         `gorm:"index" json:"source_proxy_id"` // 关联的源代理ID（可选）
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// Setting 系统设置
type Setting struct {
	Key   string `gorm:"primarykey;size:100" json:"key"`
	Value string `gorm:"type:text" json:"value"`
}
