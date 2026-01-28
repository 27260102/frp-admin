# 贡献指南 | Contributing Guide

感谢你对 frp-admin 项目的关注！欢迎提交 Issue 和 Pull Request。

Thank you for your interest in frp-admin! Issues and Pull Requests are welcome.

## 提交 Issue | Submitting Issues

- **Bug 报告**：请描述问题、复现步骤、期望行为和实际行为
- **功能建议**：请描述使用场景和期望的功能

## 提交 Pull Request

### 开发环境设置

1. Fork 并克隆仓库
2. 安装依赖：
   ```bash
   # 前端
   cd frontend && npm install

   # 后端
   cd backend && go mod tidy
   ```

3. 启动开发服务器：
   ```bash
   # 前端开发服务器 (热更新)
   cd frontend && npm run dev

   # 后端 (需要手动重启)
   cd backend && go run .
   ```

4. 前端开发时配置 CORS：
   ```bash
   export FRP_ADMIN_CORS_ORIGINS=http://localhost:5173
   ```

### 代码规范

- Go 代码请使用 `gofmt` 格式化
- React/TypeScript 代码请遵循现有风格
- 提交信息请使用清晰的描述

### PR 流程

1. 基于 `main` 分支创建功能分支
2. 完成开发和测试
3. 确保编译通过：`./build.sh`
4. 提交 PR 并描述改动内容

## 项目结构

```
frp-admin/
├── backend/              # Go 后端
│   ├── config/           # 配置管理
│   ├── models/           # GORM 数据模型
│   ├── utils/            # 工具函数
│   │   ├── frps_manager.go    # frps 进程/systemctl 管理
│   │   ├── frpc_api.go        # frpc webServer API 客户端
│   │   ├── toml_gen.go        # TOML 配置生成
│   │   └── rate_limiter.go    # 登录速率限制
│   └── main.go           # 主入口，路由定义
├── frontend/             # React 前端
│   └── src/
│       ├── api/          # API 封装
│       ├── pages/        # 页面组件
│       │   ├── Dashboard.tsx      # 仪表盘
│       │   ├── ClientList.tsx     # 客户端管理
│       │   ├── ServerConfig.tsx   # 服务端配置
│       │   └── Settings.tsx       # 系统设置
│       └── App.tsx       # 路由配置
└── build.sh              # 编译脚本
```

## 许可证

贡献的代码将采用 MIT 许可证。
