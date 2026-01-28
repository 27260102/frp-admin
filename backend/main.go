package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"frp-admin/config"
	"frp-admin/models"
	"frp-admin/utils"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

//go:embed dist/*
var frontendFS embed.FS

var db *gorm.DB

func main() {
	// 初始化配置
	config.Init()

	// 初始化数据库
	initDatabase()

	// 初始化 frps 管理器
	utils.InitFrpsManager(
		config.AppConfig.FrpsPath,
		config.AppConfig.FrpsConfig,
		config.AppConfig.FrpsManager,
		config.AppConfig.FrpsService,
	)

	// 设置 Gin
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// CORS 配置
	corsConfig := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		MaxAge:           12 * time.Hour,
	}
	if config.AppConfig.CorsOrigins != "" {
		// 配置了允许的来源
		origins := strings.Split(config.AppConfig.CorsOrigins, ",")
		for i := range origins {
			origins[i] = strings.TrimSpace(origins[i])
		}
		corsConfig.AllowOrigins = origins
		corsConfig.AllowCredentials = true
	} else {
		// 未配置则仅允许同源（不设置 AllowOrigins，使用默认行为）
		corsConfig.AllowOrigins = []string{}
		// 使用 AllowOriginFunc 动态匹配同源请求
		corsConfig.AllowOriginFunc = func(origin string) bool {
			// 允许同源请求（前端和后端在同一地址）
			return true
		}
	}
	r.Use(cors.New(corsConfig))

	// API 路由
	api := r.Group("/api")
	{
		// 公开路由
		api.POST("/login", loginHandler)
		api.GET("/health", healthHandler)

		// 需要认证的路由
		auth := api.Group("")
		auth.Use(jwtMiddleware())
		{
			// 用户管理
			auth.POST("/change-password", changePasswordHandler)

			// frps 服务管理
			auth.GET("/frps/status", frpsStatusHandler)
			auth.POST("/frps/start", frpsStartHandler)
			auth.POST("/frps/stop", frpsStopHandler)
			auth.POST("/frps/restart", frpsRestartHandler)
			auth.GET("/frps/config", getFrpsConfigHandler)
			auth.POST("/frps/config", saveFrpsConfigHandler)
			auth.POST("/frps/verify", verifyFrpsConfigHandler)
			auth.GET("/frps/logs", getFrpsLogsHandler)
			auth.GET("/frps/parsed-config", getParsedFrpsConfigHandler)

			// frps Dashboard API 代理
			auth.GET("/frps/dashboard/serverinfo", dashboardServerInfoHandler)
			auth.GET("/frps/dashboard/proxies", dashboardProxiesHandler)

			// frpc 配置管理
			auth.GET("/clients", getClientsHandler)
			auth.POST("/clients", createClientHandler)
			auth.PUT("/clients/:id", updateClientHandler)
			auth.DELETE("/clients/:id", deleteClientHandler)
			auth.GET("/clients/:id/download", downloadClientConfigHandler)

			// frpc 在线管理
			auth.GET("/clients/:id/frpc/status", frpcStatusHandler)
			auth.POST("/clients/:id/frpc/reload", frpcReloadHandler)
			auth.POST("/clients/:id/frpc/stop", frpcStopHandler)

			// 代理管理
			auth.GET("/clients/:id/proxies", getProxiesHandler)
			auth.POST("/clients/:id/proxies", createProxyHandler)
			auth.PUT("/proxies/:id", updateProxyHandler)
			auth.DELETE("/proxies/:id", deleteProxyHandler)

			// 访问者管理
			auth.GET("/clients/:id/visitors", getVisitorsHandler)
			auth.POST("/clients/:id/visitors", createVisitorHandler)
			auth.PUT("/visitors/:id", updateVisitorHandler)
			auth.DELETE("/visitors/:id", deleteVisitorHandler)
			auth.GET("/available-proxies", getAvailableProxiesHandler) // 获取可供访问的代理列表

			// 系统设置
			auth.GET("/settings", getSettingsHandler)
			auth.POST("/settings", saveSettingsHandler)

			// 端口池
			auth.GET("/available-ports", getAvailablePortsHandler)
			auth.GET("/admin-port-pool", getAdminPortPoolHandler)
		}
	}

	// 静态文件服务
	setupStaticFiles(r)

	// 启动服务器
	addr := ":" + config.AppConfig.Port
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func initDatabase() {
	var err error
	db, err = gorm.Open(sqlite.Open(config.AppConfig.DBPath), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect database: %v", err)
	}

	// 自动迁移
	db.AutoMigrate(&models.User{}, &models.FrpcConfig{}, &models.Proxy{}, &models.Visitor{}, &models.Setting{})

	// 创建默认管理员账户
	var count int64
	db.Model(&models.User{}).Count(&count)
	if count == 0 {
		// 生成随机密码
		randomPassword := config.GenerateRandomPassword()
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(randomPassword), bcrypt.DefaultCost)
		db.Create(&models.User{
			Username: "admin",
			Password: string(hashedPassword),
			IsAdmin:  true,
		})
		log.Println("========================================")
		log.Println("  首次启动，已创建管理员账户")
		log.Println("  用户名: admin")
		log.Printf("  密码: %s", randomPassword)
		log.Println("  请登录后立即修改密码！")
		log.Println("========================================")
	}
}

func setupStaticFiles(r *gin.Engine) {
	// 尝试使用嵌入的前端文件
	distFS, err := fs.Sub(frontendFS, "dist")
	if err != nil {
		log.Println("No embedded frontend files, serving from filesystem")
		r.Static("/assets", "./dist/assets")
		r.StaticFile("/", "./dist/index.html")
		r.NoRoute(func(c *gin.Context) {
			c.File("./dist/index.html")
		})
		return
	}

	// 获取 assets 子目录
	assetsFS, err := fs.Sub(distFS, "assets")
	if err != nil {
		log.Println("No assets directory found")
		return
	}

	// 手动处理 /assets/* 请求，确保正确的 MIME 类型
	r.GET("/assets/*filepath", func(c *gin.Context) {
		filepath := c.Param("filepath")
		filename := filepath[1:] // 去掉开头的 /
		data, err := fs.ReadFile(assetsFS, filename)
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}

		// 根据扩展名设置 Content-Type
		contentType := "application/octet-stream"
		if strings.HasSuffix(filepath, ".js") {
			contentType = "application/javascript"
		} else if strings.HasSuffix(filepath, ".css") {
			contentType = "text/css"
		} else if strings.HasSuffix(filepath, ".html") {
			contentType = "text/html"
		} else if strings.HasSuffix(filepath, ".json") {
			contentType = "application/json"
		} else if strings.HasSuffix(filepath, ".png") {
			contentType = "image/png"
		} else if strings.HasSuffix(filepath, ".jpg") || strings.HasSuffix(filepath, ".jpeg") {
			contentType = "image/jpeg"
		} else if strings.HasSuffix(filepath, ".svg") {
			contentType = "image/svg+xml"
		} else if strings.HasSuffix(filepath, ".woff") {
			contentType = "font/woff"
		} else if strings.HasSuffix(filepath, ".woff2") {
			contentType = "font/woff2"
		}

		c.Data(http.StatusOK, contentType, data)
	})

	r.GET("/", func(c *gin.Context) {
		data, _ := fs.ReadFile(distFS, "index.html")
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})

	r.NoRoute(func(c *gin.Context) {
		// API 路由返回 404
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API not found"})
			return
		}
		// 其他路由返回 index.html (SPA)
		data, _ := fs.ReadFile(distFS, "index.html")
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})
}

// JWT 中间件
func jwtMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// 验证签名算法是否为 HS256
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(config.AppConfig.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		// 验证 issuer
		if iss, ok := claims["iss"].(string); !ok || iss != "frp-admin" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token issuer"})
			c.Abort()
			return
		}

		c.Set("user_id", claims["user_id"])
		c.Set("username", claims["username"])
		c.Next()
	}
}

// 生成 JWT Token
func generateToken(user *models.User) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"iss":      "frp-admin",
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	})
	return token.SignedString([]byte(config.AppConfig.JWTSecret))
}

// ============= 认证相关 Handler =============

func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func loginHandler(c *gin.Context) {
	// 获取客户端 IP
	clientIP := c.ClientIP()

	// 检查是否被锁定
	limiter := utils.GetLoginRateLimiter()
	if blocked, remaining := limiter.IsBlocked(clientIP); blocked {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":       "登录尝试次数过多，请稍后再试",
			"retry_after": int(remaining.Seconds()),
		})
		return
	}

	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var user models.User
	if err := db.Where("username = ?", req.Username).First(&user).Error; err != nil {
		// 记录失败
		blocked, remaining := limiter.RecordFailure(clientIP)
		if blocked {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "登录尝试次数过多，请稍后再试",
				"retry_after": int(remaining.Seconds()),
			})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":              "用户名或密码错误",
			"remaining_attempts": limiter.GetRemainingAttempts(clientIP),
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		// 记录失败
		blocked, remaining := limiter.RecordFailure(clientIP)
		if blocked {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "登录尝试次数过多，请稍后再试",
				"retry_after": int(remaining.Seconds()),
			})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":              "用户名或密码错误",
			"remaining_attempts": limiter.GetRemainingAttempts(clientIP),
		})
		return
	}

	// 登录成功，清除失败记录
	limiter.RecordSuccess(clientIP)

	token, err := generateToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":    token,
		"username": user.Username,
	})
}

func changePasswordHandler(c *gin.Context) {
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	userID := c.GetFloat64("user_id")
	var user models.User
	if err := db.First(&user, uint(userID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid old password"})
		return
	}

	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	db.Model(&user).Update("password", string(hashedPassword))

	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

// ============= frps 服务管理 Handler =============

func frpsStatusHandler(c *gin.Context) {
	manager := utils.GetFrpsManager()
	c.JSON(http.StatusOK, manager.Status())
}

func frpsStartHandler(c *gin.Context) {
	manager := utils.GetFrpsManager()
	if err := manager.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "frps started successfully"})
}

func frpsStopHandler(c *gin.Context) {
	manager := utils.GetFrpsManager()
	if err := manager.Stop(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "frps stopped successfully"})
}

func frpsRestartHandler(c *gin.Context) {
	manager := utils.GetFrpsManager()
	if err := manager.Restart(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "frps restarted successfully"})
}

func getFrpsConfigHandler(c *gin.Context) {
	data, err := os.ReadFile(config.AppConfig.FrpsConfig)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read config file"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"config": string(data)})
}

func saveFrpsConfigHandler(c *gin.Context) {
	var req struct {
		Config string `json:"config" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 先写入临时文件验证（使用 0600 权限保护敏感信息）
	tmpFile := config.AppConfig.FrpsConfig + ".tmp"
	if err := os.WriteFile(tmpFile, []byte(req.Config), 0600); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write config"})
		return
	}

	// 验证配置
	manager := utils.GetFrpsManager()
	if err := manager.Verify(tmpFile); err != nil {
		os.Remove(tmpFile)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 验证通过，替换原文件
	os.Remove(tmpFile)
	if err := os.WriteFile(config.AppConfig.FrpsConfig, []byte(req.Config), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save config"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Config saved successfully"})
}

func verifyFrpsConfigHandler(c *gin.Context) {
	var req struct {
		Config string `json:"config" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 写入临时文件验证（使用安全的临时文件创建方式）
	tmpFile, err := os.CreateTemp("", "frps_verify_*.toml")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create temp file"})
		return
	}
	tmpFileName := tmpFile.Name()
	defer os.Remove(tmpFileName)

	if _, err := tmpFile.WriteString(req.Config); err != nil {
		tmpFile.Close()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write temp config"})
		return
	}
	tmpFile.Close()

	manager := utils.GetFrpsManager()
	if err := manager.Verify(tmpFileName); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Config is valid"})
}

func getFrpsLogsHandler(c *gin.Context) {
	manager := utils.GetFrpsManager()
	logs := manager.GetLogs(100)
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

func getParsedFrpsConfigHandler(c *gin.Context) {
	frpsConfig, err := utils.ParseFrpsToml(config.AppConfig.FrpsConfig)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse frps config"})
		return
	}
	c.JSON(http.StatusOK, frpsConfig)
}

// ============= frps Dashboard API 代理 =============

func getDashboardClient() *utils.DashboardClient {
	// 从 frps.toml 读取 dashboard 配置
	frpsConfig, err := utils.ParseFrpsToml(config.AppConfig.FrpsConfig)
	if err != nil {
		// 使用默认值
		return utils.NewDashboardClient("127.0.0.1", 7500, "admin", "admin")
	}
	return utils.NewDashboardClient(
		frpsConfig.WebServerAddr,
		frpsConfig.WebServerPort,
		frpsConfig.WebServerUser,
		frpsConfig.WebServerPass,
	)
}

func dashboardServerInfoHandler(c *gin.Context) {
	client := getDashboardClient()
	info, err := client.GetServerInfo()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, info)
}

func dashboardProxiesHandler(c *gin.Context) {
	client := getDashboardClient()
	proxies, err := client.GetAllProxies()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"proxies": proxies})
}

// ============= frpc 配置管理 Handler =============

func getClientsHandler(c *gin.Context) {
	var clients []models.FrpcConfig
	db.Preload("Proxies").Preload("Visitors").Find(&clients)
	c.JSON(http.StatusOK, gin.H{"clients": clients})
}

func createClientHandler(c *gin.Context) {
	var req models.FrpcConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 处理管理配置
	if req.AdminEnabled {
		// 本地端口默认 7400
		if req.AdminPort == 0 {
			req.AdminPort = 7400
		}
		// 自动分配远程端口
		if req.AdminRemotePort == 0 {
			req.AdminRemotePort = allocateAdminPort(0)
		}
	}

	if err := db.Create(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create client"})
		return
	}

	c.JSON(http.StatusOK, req)
}

func updateClientHandler(c *gin.Context) {
	id := c.Param("id")
	var client models.FrpcConfig
	if err := db.First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	var req models.FrpcConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 处理管理配置
	adminPort := req.AdminPort
	adminRemotePort := req.AdminRemotePort
	if req.AdminEnabled {
		// 本地端口默认 7400
		if adminPort == 0 {
			adminPort = 7400
		}
		// 自动分配远程端口
		if adminRemotePort == 0 {
			adminRemotePort = allocateAdminPort(client.ID)
		}
	} else {
		// 禁用管理时清除端口
		adminRemotePort = 0
	}

	db.Model(&client).Updates(map[string]interface{}{
		"name":              req.Name,
		"user":              req.User,
		"remark":            req.Remark,
		"admin_enabled":     req.AdminEnabled,
		"admin_port":        adminPort,
		"admin_user":        req.AdminUser,
		"admin_pass":        req.AdminPass,
		"admin_remote_port": adminRemotePort,
	})

	// 重新加载更新后的数据
	db.First(&client, id)
	c.JSON(http.StatusOK, client)
}

// allocateAdminPort 为客户端分配一个管理远程端口
func allocateAdminPort(excludeClientID uint) int {
	// 获取管理端口池配置
	var startSetting, endSetting models.Setting
	db.Where("key = ?", "admin_port_pool_start").First(&startSetting)
	db.Where("key = ?", "admin_port_pool_end").First(&endSetting)

	portStart := 17000 // 默认起始
	portEnd := 17100   // 默认结束
	if startSetting.Value != "" {
		if v, err := strconv.Atoi(startSetting.Value); err == nil {
			portStart = v
		}
	}
	if endSetting.Value != "" {
		if v, err := strconv.Atoi(endSetting.Value); err == nil {
			portEnd = v
		}
	}

	// 获取已使用的管理端口
	var usedPorts []int
	db.Model(&models.FrpcConfig{}).
		Where("admin_remote_port > 0 AND id != ?", excludeClientID).
		Pluck("admin_remote_port", &usedPorts)

	usedMap := make(map[int]bool)
	for _, p := range usedPorts {
		usedMap[p] = true
	}

	// 分配第一个可用端口
	for port := portStart; port <= portEnd; port++ {
		if !usedMap[port] {
			return port
		}
	}

	return 0 // 端口池已满
}

func deleteClientHandler(c *gin.Context) {
	id := c.Param("id")

	// 删除关联的代理
	db.Where("frpc_config_id = ?", id).Delete(&models.Proxy{})
	// 删除关联的访问者
	db.Where("frpc_config_id = ?", id).Delete(&models.Visitor{})

	// 删除客户端配置
	if err := db.Delete(&models.FrpcConfig{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete client"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Client deleted successfully"})
}

// ============= frpc 在线管理 Handler =============

func getFrpcClient(client *models.FrpcConfig) (*utils.FrpcClient, error) {
	if !client.AdminEnabled {
		return nil, fmt.Errorf("该客户端未启用在线管理")
	}
	if client.AdminRemotePort <= 0 {
		return nil, fmt.Errorf("该客户端未分配管理端口，请重新保存配置")
	}
	// 通过 127.0.0.1:AdminRemotePort 访问（frpc-admin 代理映射到 frps）
	return utils.NewFrpcClient("127.0.0.1", client.AdminRemotePort, client.AdminUser, client.AdminPass), nil
}

// generateClientToml 生成客户端的 TOML 配置
func generateClientToml(client *models.FrpcConfig) (string, error) {
	// 从 frps.toml 读取 token
	frpsConfig, _ := utils.ParseFrpsToml(config.AppConfig.FrpsConfig)
	authToken := "your-token"
	if frpsConfig != nil {
		authToken = frpsConfig.AuthToken
	}

	// 服务器公网地址和端口从设置中读取
	serverAddr := "your-server-addr"
	serverPort := 7000
	if frpsConfig != nil {
		serverPort = frpsConfig.BindPort
	}

	var settings []models.Setting
	db.Where("key IN ?", []string{"server_addr", "server_port"}).Find(&settings)
	for _, s := range settings {
		switch s.Key {
		case "server_addr":
			serverAddr = s.Value
		case "server_port":
			if v, err := strconv.Atoi(s.Value); err == nil {
				serverPort = v
			}
		}
	}

	// 构建代理配置
	var proxies []utils.ProxyConfig
	for _, p := range client.Proxies {
		proxy := utils.ProxyConfig{
			Name:                       p.Name,
			Type:                       p.Type,
			LocalIP:                    p.LocalIP,
			LocalPort:                  p.LocalPort,
			RemotePort:                 p.RemotePort,
			SecretKey:                  p.SecretKey,
			AllowUsers:                 p.AllowUsers,
			BandwidthLimit:             p.BandwidthLimit,
			BandwidthLimitMode:         p.BandwidthLimitMode,
			UseEncryption:              p.UseEncryption,
			UseCompression:             p.UseCompression,
			HealthCheckType:            p.HealthCheckType,
			HealthCheckTimeoutSeconds:  p.HealthCheckTimeoutSeconds,
			HealthCheckMaxFailed:       p.HealthCheckMaxFailed,
			HealthCheckIntervalSeconds: p.HealthCheckIntervalSeconds,
			HealthCheckPath:            p.HealthCheckPath,
			PluginType:                 p.PluginType,
		}
		if p.PluginParams != "" {
			var pluginParams map[string]interface{}
			if err := json.Unmarshal([]byte(p.PluginParams), &pluginParams); err == nil {
				proxy.PluginParams = pluginParams
			}
		}
		proxies = append(proxies, proxy)
	}

	// 构建访问者配置
	var visitors []utils.VisitorConfig
	for _, v := range client.Visitors {
		visitor := utils.VisitorConfig{
			Name:       v.Name,
			Type:       v.Type,
			ServerName: v.ServerName,
			SecretKey:  v.SecretKey,
			BindAddr:   v.BindAddr,
			BindPort:   v.BindPort,
		}
		visitors = append(visitors, visitor)
	}

	// 生成 TOML 配置
	tomlConfig := utils.FrpcTomlConfig{
		ServerAddr:      serverAddr,
		ServerPort:      serverPort,
		AuthToken:       authToken,
		User:            client.User,
		AdminEnabled:    client.AdminEnabled,
		AdminPort:       client.AdminPort,
		AdminUser:       client.AdminUser,
		AdminPass:       client.AdminPass,
		AdminRemotePort: client.AdminRemotePort,
		Proxies:         proxies,
		Visitors:        visitors,
	}

	return utils.GenerateFrpcToml(tomlConfig), nil
}

func frpcStatusHandler(c *gin.Context) {
	id := c.Param("id")
	var client models.FrpcConfig
	if err := db.First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	frpcClient, err := getFrpcClient(&client)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status, err := frpcClient.GetStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法连接到 frpc: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, status)
}

func frpcReloadHandler(c *gin.Context) {
	id := c.Param("id")
	var client models.FrpcConfig
	if err := db.Preload("Proxies").Preload("Visitors").First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	frpcClient, err := getFrpcClient(&client)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 生成最新的配置
	tomlContent, err := generateClientToml(&client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成配置失败: " + err.Error()})
		return
	}

	// 推送配置到 frpc
	if err := frpcClient.UpdateConfig(tomlContent); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "推送配置失败: " + err.Error()})
		return
	}

	// 重载配置
	if err := frpcClient.Reload(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重载失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "配置已推送并重载"})
}

func frpcStopHandler(c *gin.Context) {
	id := c.Param("id")
	var client models.FrpcConfig
	if err := db.First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	frpcClient, err := getFrpcClient(&client)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := frpcClient.Stop(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "停止失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "frpc 已停止"})
}

func downloadClientConfigHandler(c *gin.Context) {
	id := c.Param("id")

	var client models.FrpcConfig
	if err := db.Preload("Proxies").Preload("Visitors").First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	content, err := generateClientToml(&client)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成配置失败: " + err.Error()})
		return
	}

	// 设置下载头
	filename := fmt.Sprintf("frpc_%s.toml", client.User)
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "application/toml")
	c.String(http.StatusOK, content)
}

// ============= 代理管理 Handler =============

func getProxiesHandler(c *gin.Context) {
	clientID := c.Param("id")
	var proxies []models.Proxy
	db.Where("frpc_config_id = ?", clientID).Find(&proxies)
	c.JSON(http.StatusOK, gin.H{"proxies": proxies})
}

func createProxyHandler(c *gin.Context) {
	clientID := c.Param("id")

	var client models.FrpcConfig
	if err := db.First(&client, clientID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	var req models.Proxy
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 检查同一客户端下代理名称是否重复
	var existingProxy models.Proxy
	if err := db.Where("frpc_config_id = ? AND name = ?", client.ID, req.Name).First(&existingProxy).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "代理名称已存在，请使用其他名称"})
		return
	}

	// 检查代理名称是否与访问名称冲突
	var existingVisitor models.Visitor
	if err := db.Where("frpc_config_id = ? AND name = ?", client.ID, req.Name).First(&existingVisitor).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该名称已被访问配置使用，请使用其他名称"})
		return
	}

	req.FrpcConfigID = client.ID
	if err := db.Create(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create proxy"})
		return
	}

	c.JSON(http.StatusOK, req)
}

func updateProxyHandler(c *gin.Context) {
	id := c.Param("id")
	var proxy models.Proxy
	if err := db.First(&proxy, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Proxy not found"})
		return
	}

	var req models.Proxy
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 如果名称变更，检查是否重复
	if req.Name != "" && req.Name != proxy.Name {
		var existingProxy models.Proxy
		if err := db.Where("frpc_config_id = ? AND name = ? AND id != ?", proxy.FrpcConfigID, req.Name, proxy.ID).First(&existingProxy).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "代理名称已存在，请使用其他名称"})
			return
		}
		// 检查是否与访问名称冲突
		var existingVisitor models.Visitor
		if err := db.Where("frpc_config_id = ? AND name = ?", proxy.FrpcConfigID, req.Name).First(&existingVisitor).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "该名称已被访问配置使用，请使用其他名称"})
			return
		}
	}

	db.Model(&proxy).Updates(req)
	c.JSON(http.StatusOK, proxy)
}

func deleteProxyHandler(c *gin.Context) {
	id := c.Param("id")
	if err := db.Delete(&models.Proxy{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete proxy"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Proxy deleted successfully"})
}

// ============= 访问者管理 Handler =============

func getVisitorsHandler(c *gin.Context) {
	clientID := c.Param("id")
	var visitors []models.Visitor
	db.Where("frpc_config_id = ?", clientID).Find(&visitors)
	c.JSON(http.StatusOK, gin.H{"visitors": visitors})
}

func createVisitorHandler(c *gin.Context) {
	clientID := c.Param("id")

	var client models.FrpcConfig
	if err := db.First(&client, clientID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	var req models.Visitor
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 检查同一客户端下访问名称是否重复
	var existingVisitor models.Visitor
	if err := db.Where("frpc_config_id = ? AND name = ?", client.ID, req.Name).First(&existingVisitor).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "访问名称已存在，请使用其他名称"})
		return
	}

	// 检查访问名称是否与代理名称冲突
	var existingProxy models.Proxy
	if err := db.Where("frpc_config_id = ? AND name = ?", client.ID, req.Name).First(&existingProxy).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该名称已被代理使用，请使用其他名称"})
		return
	}

	req.FrpcConfigID = client.ID
	if err := db.Create(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create visitor"})
		return
	}

	c.JSON(http.StatusOK, req)
}

func updateVisitorHandler(c *gin.Context) {
	id := c.Param("id")
	var visitor models.Visitor
	if err := db.First(&visitor, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Visitor not found"})
		return
	}

	var req models.Visitor
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 如果名称变更，检查是否重复
	if req.Name != "" && req.Name != visitor.Name {
		var existingVisitor models.Visitor
		if err := db.Where("frpc_config_id = ? AND name = ? AND id != ?", visitor.FrpcConfigID, req.Name, visitor.ID).First(&existingVisitor).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "访问名称已存在，请使用其他名称"})
			return
		}
		// 检查是否与代理名称冲突
		var existingProxy models.Proxy
		if err := db.Where("frpc_config_id = ? AND name = ?", visitor.FrpcConfigID, req.Name).First(&existingProxy).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "该名称已被代理使用，请使用其他名称"})
			return
		}
	}

	db.Model(&visitor).Updates(req)
	c.JSON(http.StatusOK, visitor)
}

func deleteVisitorHandler(c *gin.Context) {
	id := c.Param("id")
	if err := db.Delete(&models.Visitor{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete visitor"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Visitor deleted successfully"})
}

// 获取可供访问的代理列表（STCP/XTCP/SUDP类型，排除当前客户端自己的代理）
func getAvailableProxiesHandler(c *gin.Context) {
	excludeClientID := c.Query("exclude_client_id")

	var proxies []models.Proxy
	query := db.Where("type IN ?", []string{"stcp", "xtcp", "sudp"})
	if excludeClientID != "" {
		query = query.Where("frpc_config_id != ?", excludeClientID)
	}
	query.Find(&proxies)

	// 获取关联的客户端信息用于构建完整的 serverName
	type ProxyWithClient struct {
		models.Proxy
		ClientName string `json:"client_name"`
		ClientUser string `json:"client_user"`
		ServerName string `json:"server_name"` // 完整的服务名称
	}

	var result []ProxyWithClient
	for _, p := range proxies {
		var client models.FrpcConfig
		db.First(&client, p.FrpcConfigID)

		serverName := p.Name
		if client.User != "" {
			serverName = client.User + "." + p.Name
		}

		result = append(result, ProxyWithClient{
			Proxy:      p,
			ClientName: client.Name,
			ClientUser: client.User,
			ServerName: serverName,
		})
	}

	c.JSON(http.StatusOK, gin.H{"proxies": result})
}

// ============= 系统设置 Handler =============

func getSettingsHandler(c *gin.Context) {
	var settings []models.Setting
	db.Find(&settings)

	result := make(map[string]string)
	for _, s := range settings {
		result[s.Key] = s.Value
	}

	c.JSON(http.StatusOK, result)
}

func saveSettingsHandler(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	for key, value := range req {
		db.Where("key = ?", key).Assign(models.Setting{Value: value}).FirstOrCreate(&models.Setting{Key: key})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Settings saved successfully"})
}

// 获取可用端口列表
func getAvailablePortsHandler(c *gin.Context) {
	// 获取端口池配置
	var settings []models.Setting
	db.Where("key IN ?", []string{"port_pool_start", "port_pool_end"}).Find(&settings)

	portStart := 10000
	portEnd := 20000
	for _, s := range settings {
		if v, err := strconv.Atoi(s.Value); err == nil {
			switch s.Key {
			case "port_pool_start":
				portStart = v
			case "port_pool_end":
				portEnd = v
			}
		}
	}

	// 获取已使用的端口
	var usedPorts []int
	db.Model(&models.Proxy{}).
		Where("type IN ? AND remote_port > 0", []string{"tcp", "udp"}).
		Pluck("remote_port", &usedPorts)

	usedPortMap := make(map[int]bool)
	for _, p := range usedPorts {
		usedPortMap[p] = true
	}

	// 生成可用端口列表（最多返回100个）
	var availablePorts []int
	for port := portStart; port <= portEnd && len(availablePorts) < 100; port++ {
		if !usedPortMap[port] {
			availablePorts = append(availablePorts, port)
		}
	}

	// 获取端口使用详情
	type PortUsage struct {
		Port       int    `json:"port"`
		ProxyName  string `json:"proxy_name"`
		ProxyType  string `json:"proxy_type"`
		ClientName string `json:"client_name"`
		ClientUser string `json:"client_user"`
	}
	var portUsages []PortUsage

	db.Table("proxies").
		Select("proxies.remote_port as port, proxies.name as proxy_name, proxies.type as proxy_type, frpc_configs.name as client_name, frpc_configs.user as client_user").
		Joins("LEFT JOIN frpc_configs ON proxies.frpc_config_id = frpc_configs.id").
		Where("proxies.type IN ? AND proxies.remote_port > 0 AND proxies.deleted_at IS NULL AND frpc_configs.deleted_at IS NULL", []string{"tcp", "udp"}).
		Order("proxies.remote_port").
		Scan(&portUsages)

	c.JSON(http.StatusOK, gin.H{
		"ports":           availablePorts,
		"used_ports":      usedPorts,
		"port_usages":     portUsages,
		"pool_start":      portStart,
		"pool_end":        portEnd,
		"total_used":      len(usedPorts),
		"total_available": (portEnd - portStart + 1) - len(usedPorts),
	})
}

// 获取管理端口池使用情况
func getAdminPortPoolHandler(c *gin.Context) {
	// 获取管理端口池配置
	var startSetting, endSetting models.Setting
	db.Where("key = ?", "admin_port_pool_start").First(&startSetting)
	db.Where("key = ?", "admin_port_pool_end").First(&endSetting)

	portStart := 17000
	portEnd := 17100
	if startSetting.Value != "" {
		if v, err := strconv.Atoi(startSetting.Value); err == nil {
			portStart = v
		}
	}
	if endSetting.Value != "" {
		if v, err := strconv.Atoi(endSetting.Value); err == nil {
			portEnd = v
		}
	}

	// 获取已使用的管理端口
	type AdminPortUsage struct {
		Port       int    `json:"port"`
		ClientName string `json:"client_name"`
		ClientUser string `json:"client_user"`
		AdminPort  int    `json:"admin_port"`
	}
	var portUsages []AdminPortUsage

	db.Model(&models.FrpcConfig{}).
		Select("admin_remote_port as port, name as client_name, user as client_user, admin_port").
		Where("admin_enabled = ? AND admin_remote_port > 0", true).
		Order("admin_remote_port").
		Scan(&portUsages)

	totalUsed := len(portUsages)
	totalAvailable := (portEnd - portStart + 1) - totalUsed

	c.JSON(http.StatusOK, gin.H{
		"pool_start":      portStart,
		"pool_end":        portEnd,
		"total_used":      totalUsed,
		"total_available": totalAvailable,
		"port_usages":     portUsages,
	})
}
