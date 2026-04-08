# 汇报助手 (Daily Report Helper)

一款现代化的智能工作汇报生成工具，支持日报、周报、月报的自动生成与 AI 辅助优化。

## 功能特性

### 核心功能
- **GitLab 集成** - 自动拉取用户的 Git 提交记录，无需逐项目配置
- **智能合并** - 将多条提交记录智能合并为清晰的工作描述
- **日报生成** - 支持今日完成工作、遇到问题、明日计划、备注等完整结构
- **周报/月报** - 一键生成 14 天周报、45 天月报
- **历史记录** - 本地 JSON 文件存储，随时查阅历史汇报

### AI 智能助手
- **多 AI 提供商支持** - OpenAI、DeepSeek、智谱 GLM、阿里百炼、字节火山、Moonshot 等
- **AI 生成** - 根据 Git 提交记录自动生成完整日报
- **AI 重写** - 对已有内容进行专业润色优化
- **职位上下文** - 设置职位后，AI 生成更贴合实际的工作内容

### 用户体验
- **现代化界面** - 宇宙星空主题，3D 可交互粒子背景
- **Tab 页面切换** - 日报/周报/月报独立页面，流畅动画过渡
- **响应式设计** - 完美适配桌面端和移动端
- **一键复制** - 生成后快速复制到剪贴板

## 技术架构

### 后端 (Node.js + Express)
```
server.js          # 主服务器，包含所有 API 路由
├── GitLab API     # /api/commits 获取用户提交记录
├── AI 接口        # /api/ai-generate, /api/ai-rewrite, /api/ai-period-report
├── 历史记录       # /api/history CRUD 操作
└── 配置管理       # /api/config 读取/保存配置
```

### 前端 (Vanilla HTML/CSS/JS)
```
public/
├── index.html     # 页面结构，Tab 导航布局
├── app.js         # 前端逻辑，API 调用，事件处理
├── style.css      # 样式表，宇宙主题，动画效果
└── particles.js   # 3D 粒子背景系统
```

### 数据存储
- **config.json** - GitLab 配置、AI 配置、用户职位等
- **history.json** - 历史日报记录，按日期索引

### 关键 API 路由

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/config` | 获取配置信息 |
| POST | `/api/config` | 保存配置 |
| GET | `/api/commits?days=N` | 拉取 N 天内的 Git 提交 |
| POST | `/api/ai-generate` | AI 生成完整日报 |
| POST | `/api/ai-rewrite` | AI 重写已有内容 |
| POST | `/api/ai-period-report` | AI 生成周报/月报 |
| POST | `/api/smart-merge` | 智能合并提交记录 |
| GET/POST/DELETE | `/api/history` | 历史记录管理 |

## AI 提示词设计

系统会根据不同场景动态生成提示词：

**日报生成** - 携带 Git 提交记录，生成完整钉钉格式日报
**内容重写** - 仅重写已填写部分，空白部分保持不变
**周期报告** - 按时间范围聚合工作，生成结构化周期汇报

AI 返回内容通过正则解析自动填充到对应文本框。

## 快速开始

```bash
npm install
npm start
```

访问 http://localhost:3000

## 配置说明

1. 点击「配置」按钮
2. 填写 GitLab 信息：
   - **GitLab 地址**: 如 `https://gitlab.com` 或私有部署地址
   - **访问令牌**: GitLab Personal Access Token (需要 read_api 权限)
   - **用户名**: 用于过滤本人提交（可选）
   - **职位**: 用于 AI 生成时参考（如：Java后端开发）
3. 填写 AI 信息：
   - **AI 提供商**: 选择预设或自定义
   - **API 地址**: AI 服务端点
   - **API Key**: AI 服务密钥
   - **模型**: AI 模型名称
4. 保存配置

## 部署

### Vercel
```bash
npm install -g vercel
vercel
```

### Render
关联 GitHub 仓库，Render 会自动检测并部署。

### 自有服务器
```bash
git clone <repo>
npm install
npm start
```

可通过环境变量配置端口：
- `PORT`: 服务器端口 (默认 3000)
- `HOST`: 监听地址 (默认 0.0.0.0)

## 钉钉日报格式

```
【工作日报】
日期：2026-04-08

今日完成工作：
1. 完成用户登录功能开发
2. 优化订单列表查询性能

遇到问题及解决方案：
1. 第三方接口超时，已添加重试机制

明日工作计划：
1. 完成订单模块开发
2. 进行代码评审

备注：
无
```

## License

MIT
