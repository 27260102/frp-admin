package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
)

type Config struct {
	Port        string
	DBPath      string
	JWTSecret   string
	FrpsPath    string
	FrpsConfig  string
	FrpcPath    string
	// frps 管理方式: "process"(直接进程) 或 "systemctl"(通过systemctl)
	FrpsManager string
	// systemctl 模式下的 service 名称
	FrpsService string
	// CORS 允许的来源，多个用逗号分隔，默认空表示仅同源
	CorsOrigins string
}

var AppConfig *Config

func Init() {
	AppConfig = &Config{
		Port:        getEnv("FRP_ADMIN_PORT", "8080"),
		DBPath:      getEnv("FRP_ADMIN_DB", "frp_admin.db"),
		JWTSecret:   getEnv("FRP_ADMIN_SECRET", generateSecret()),
		FrpsPath:    getEnv("FRP_ADMIN_FRPS_PATH", getFrpsPath()),
		FrpsConfig:  getEnv("FRP_ADMIN_FRPS_CONFIG", getFrpsConfigPath()),
		FrpcPath:    getEnv("FRP_ADMIN_FRPC_PATH", getFrpcPath()),
		FrpsManager: getEnv("FRP_ADMIN_FRPS_MANAGER", "process"), // process 或 systemctl
		FrpsService: getEnv("FRP_ADMIN_FRPS_SERVICE", "frps"),    // systemctl 模式下的服务名
		CorsOrigins: getEnv("FRP_ADMIN_CORS_ORIGINS", ""),        // CORS 允许的来源，空表示仅同源
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func generateSecret() string {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		panic("failed to generate random secret: " + err.Error())
	}
	return hex.EncodeToString(bytes)
}

// GenerateRandomPassword 生成随机密码（用于首次启动）
func GenerateRandomPassword() string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	bytes := make([]byte, 12)
	if _, err := rand.Read(bytes); err != nil {
		panic("failed to generate random password: " + err.Error())
	}
	for i, b := range bytes {
		bytes[i] = chars[int(b)%len(chars)]
	}
	return string(bytes)
}

func getFrpsPath() string {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "frps")
}

func getFrpcPath() string {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "frpc")
}

func getFrpsConfigPath() string {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "frps.toml")
}
