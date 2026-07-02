# Personal Travel Director Agent

一款用于学习并实践完整 Agent App 的工程：手机端旅行助手 + FastAPI 后端 + LangGraph 编排 + RAG + 多模态输入 + 地图/天气/日历工具。

## Quick Start

```bash
cp .env.example .env
py -3.13 -m pip install -r apps/api/requirements.txt
npm install
npm run dev:api
npm run dev:mobile
```

当前工程可在普通 Python 3.13 下运行基础 Agent fallback。Windows 上如果 `py` 默认指向 `3.13t`，请使用 `py -3.13`。要真实启用 LangChain/LangGraph 依赖，建议创建 Python 3.11/3.12 虚拟环境后重新安装 `apps/api/requirements.txt`，依赖文件会自动安装对应框架包。

## Apps

- `apps/api`: FastAPI 后端，包含 Agent 工作流、RAG、多模态解析和旅行工具。
- `apps/mobile`: Expo React Native App，包含意图输入、行程卡片、动态微调和跨端执行入口。

## First Demo Flow

1. 在手机端输入旅行需求。
2. 后端提取结构化意图。
3. LangGraph 调用上下文检索、天气、地点、路线和日程冲突工具。
4. Agent 生成可解释行程并保存版本。
5. 用户继续对话或提交微调请求，生成新版本。
