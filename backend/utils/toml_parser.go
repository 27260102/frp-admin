package utils

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// FrpsConfig frps.toml 解析后的配置
type FrpsConfig struct {
	BindAddr      string `json:"bind_addr"`
	BindPort      int    `json:"bind_port"`
	AuthMethod    string `json:"auth_method"`
	AuthToken     string `json:"auth_token"`
	WebServerAddr string `json:"web_server_addr"`
	WebServerPort int    `json:"web_server_port"`
	WebServerUser string `json:"web_server_user"`
	WebServerPass string `json:"web_server_pass"`
}

// ParseFrpsToml 解析 frps.toml 配置文件
func ParseFrpsToml(filepath string) (*FrpsConfig, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	config := &FrpsConfig{
		BindAddr:      "0.0.0.0",
		BindPort:      7000,
		AuthMethod:    "token",
		WebServerAddr: "127.0.0.1",
		WebServerPort: 7500,
		WebServerUser: "admin",
		WebServerPass: "admin",
	}

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// 跳过注释和空行
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// 解析 key = value
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, "\"")

		switch key {
		case "bindAddr":
			config.BindAddr = value
		case "bindPort":
			if v, err := strconv.Atoi(value); err == nil {
				config.BindPort = v
			}
		case "auth.method":
			config.AuthMethod = value
		case "auth.token":
			config.AuthToken = value
		case "webServer.addr":
			config.WebServerAddr = value
		case "webServer.port":
			if v, err := strconv.Atoi(value); err == nil {
				config.WebServerPort = v
			}
		case "webServer.user":
			config.WebServerUser = value
		case "webServer.password":
			config.WebServerPass = value
		}
	}

	return config, scanner.Err()
}
