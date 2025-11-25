[English](README.md)

# AI 标题助理

AI 标题助理让你在思源笔记中一键调用大模型生成优质标题，兼容 OpenAI 风格接口，所有请求都由你掌控。

## 功能亮点

- **完善的 AI 配置界面**：在同一处调整 Base URL、API Key、模型、Temperature、Top P、最大 token、语言、语气等。
- **完全手动触发**：只在你点击顶栏魔杖或命令面板（桌面快捷键 ⇧⌘T）时才会发起请求。
- **自定义提示词模板**：支持 {{content}}、{{language}}、{{tone}} 占位符，方便适配不同文风。
- **多种上下文策略**：自动、仅选区、块级、整篇文档模式，可配置字符上限，精准控制信息暴露。
- **标题确认弹窗**：可复制结果或通过 /api/filetree/renameDocByID 安全替换文档标题。

## 使用步骤

1. 克隆或复制仓库至 {workspace}/data/plugins/siyuan-biaoti。
2. 安装依赖并启动实时编译：

   `ash
   pnpm install
   pnpm run dev   # 实时编译
   `

3. 在思源集市或「已下载」列表中启用 **AI 标题助理**。
4. 打开 **设置 → 插件 → AI 标题助理**，配置：
   - API Base URL（默认 https://api.openai.com/v1）
   - API Key（本地保存，并可一键测试连通性）
   - 模型与参数（Temperature、Top P、最大 token）
   - 标题语言、语气预设、上下文策略、提示词模板
5. 打开任意文档，点击魔杖或按 ⇧⌘T，确认生成的标题后复制或应用。

> 提示：若 API 请求失败，请检查密钥与网络，重新执行 pnpm run dev 保存最新构建，并在思源中按 Ctrl + R 重载插件。

### API 密钥配置

1. 首次使用请选择服务商（OpenAI、Anthropic、Gemini、DeepSeek、智谱 AI 等）。
2. 服务商配置 会自动填好 API 地址，只需粘贴 sk-xxx 格式秘钥。
3. 点击 **测试连通** 会调用 ${baseUrl}/models 获取可用模型列表。
4. 凭据由思源加密后保存，位于 {workspace}/data/storage 插件数据目录。

## 参数说明

- **API Base URL**：任意 OpenAI 兼容网关，如官方 OpenAI、Azure OpenAI、OneAPI 等。
- **API Key**：仅保存在插件数据目录；点击「测试连通」会请求 /models 进行校验。
- **Model**：与你所选服务商兼容的 Chat Completion 模型 ID。
- **Temperature / Top P**：控制随机度（默认 0.5 / 0.9），如不确定可保持 Top P=1。
- **Max Tokens**：限制标题长度，避免输出冗长段落。
- **Language & Tone**：写入提示词模板，引导模型语言与语气。
- **Context Strategy & Limit**：自动/选区/块/全文，默认 1200 字符，用于限制 token 消耗。
- **Prompt Template**：可完全自定义；清空则恢复内置模板与占位符。

## 触发流程

1. 点击魔杖或命令面板。
2. 插件按策略提取上下文，清理空白并截断到设定字符上限。
3. 按优先级调用 ${baseUrl}/chat/completions，必要时自动重试/切换服务商。
4. 弹窗展示候选标题，可复制或应用。
5. 应用标题时调用官方 API 重命名文档，保证与同步/版本控制兼容。

## 开发与迭代

- pnpm run dev：开发模式；pnpm run build：生成发布用 package.zip。
- pnpm run lint：在提交前执行 ESLint。
- 参阅 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) 获取流程、架构与测试建议。

## 隐私声明

- API Key 永不离开本地，随时可覆盖或删除。
- 仅上传选中内容或截断后的文本，从不扫描全库。
- 所有请求基于思源内置 etch，不包含额外遥测。
