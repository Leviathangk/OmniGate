#!/bin/bash

# 遇到任何错误立即退出
set -e

# 终端彩色输出定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # 无颜色

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}        OmniGate 一键本地打包与构建工具             ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. 检查 Node.js 环境
echo -e "${CYAN}[1/4] 检查 Node.js 环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未检测到 Node.js，请先安装 Node.js (推荐 v20 或以上)。${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js 已安装: $(node -v)${NC}"

# 2. 检查 Rust 环境
echo -e "${CYAN}[2/4] 检查 Rust/Cargo 环境...${NC}"
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}❌ 未检测到 Rust/Cargo 编译器。${NC}"
    echo -e "${YELLOW}请在终端运行以下命令安装 Rust 环境:${NC}"
    echo -e "   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi
echo -e "${GREEN}✓ Rust 已安装: $(rustc --version)${NC}"

# 3. 安装项目依赖
echo -e "${CYAN}[3/4] 正在检查并安装前端依赖...${NC}"
npm install
echo -e "${GREEN}✓ 依赖安装/更新成功。${NC}"

# 4. 执行编译与打包
echo -e "${CYAN}[4/4] 正在调用 Tauri 引擎打包 OmniGate 应用程序...${NC}"
echo -e "${YELLOW}首次编译可能需要下载并缓存 Rust 依赖库，这需要花费几分钟，请耐心等待...${NC}"

# 调用 tauri-cli 进行打包
npx tauri build

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}🎉 OmniGate 本地安装包打包成功！${NC}"
echo -e "${GREEN}====================================================${NC}"

# 根据系统平台显示安装包存放目录
OS_TYPE=$(uname)
if [ "$OS_TYPE" == "Darwin" ]; then
    echo -e "${YELLOW}MacOS 安装包生成位置:${NC}"
    echo -e "👉 DMG 安装包: ${CYAN}src-tauri/target/release/bundle/dmg/${NC}"
    echo -e "👉 APP 应用程序: ${CYAN}src-tauri/target/release/bundle/macos/${NC}"
    
    # 自动打开生成的 DMG 安装包所在的 Finder 目录
    if [ -d "src-tauri/target/release/bundle/dmg" ]; then
        open "src-tauri/target/release/bundle/dmg"
    elif [ -d "src-tauri/target/release/bundle/macos" ]; then
        open "src-tauri/target/release/bundle/macos"
    fi
elif [ "$OS_TYPE" == "Linux" ]; then
    echo -e "${YELLOW}Linux 安装包生成位置:${NC}"
    echo -e "👉 Deb/AppImage 包: ${CYAN}src-tauri/target/release/bundle/${NC}"
else
    echo -e "${YELLOW}Windows 安装包生成位置:${NC}"
    echo -e "👉 MSI/EXE 安装包: ${CYAN}src-tauri/target/release/bundle/nsis/${NC}"
fi

echo -e "${BLUE}====================================================${NC}"
