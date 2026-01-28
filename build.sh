#!/bin/bash
set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 代理设置（如需要可取消注释）
# export http_proxy=http://your-proxy:port
# export https_proxy=http://your-proxy:port

echo "=== Building FRP Admin ==="
echo "Working directory: $SCRIPT_DIR"

# 检查依赖
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required"; exit 1; }
command -v go >/dev/null 2>&1 || { echo "Error: Go is required"; exit 1; }

# 前端编译
echo ""
echo ">>> Building frontend..."
cd frontend
npm install
npm run build
cd ..

# 后端编译
echo ""
echo ">>> Building backend..."
cd backend
go mod tidy
go build -ldflags="-s -w" -o ../frp-admin .
cd ..

echo ""
echo "=== Build completed ==="
echo ""
echo "Output: $SCRIPT_DIR/frp-admin"
echo ""
echo "Usage:"
echo "  ./frp-admin                       # Start server on :8080"
echo "  FRP_ADMIN_PORT=9000 ./frp-admin   # Custom port"
echo ""
echo "Note: On first startup, a random admin password will be generated and displayed."
echo "      Please save it securely."
