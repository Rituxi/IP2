# IP2Region API - Cloudflare Workers 版

基于 [ip2region](https://github.com/lionsoul2014/ip2region/) 的离线 IP 地址定位 API 服务，部署在 Cloudflare Workers 上。

- 完全离线查询，无需调用外部 API
- 中国地区返回中文，非中国地区返回英文
- 支持 IPv4 和 IPv6
- IPv4 默认加载（10MB），IPv6 按需加载（34MB）
- 查询速度微秒级
- 全中文输出

---

## API 接口

### 查询 IP 地址

```
GET /api/lookup?ip=8.8.8.8
```

**返回示例（中国 IP）：**

```json
{
  "ip": "113.118.113.77",
  "版本": 4,
  "国家": "中国",
  "省份": "广东省",
  "城市": "深圳市",
  "运营商": "电信",
  "国家代码": "CN",
  "位置": "广东 深圳",
  "原始数据": "中国|广东省|深圳市|电信|CN"
}
```

**返回示例（国外 IP）：**

```json
{
  "ip": "8.8.8.8",
  "版本": 4,
  "国家": "United States",
  "省份": "California",
  "城市": "0",
  "运营商": "Google LLC",
  "国家代码": "US",
  "位置": "California 0",
  "原始数据": "United States|California|0|Google LLC|US"
}
```

**返回示例（IPv6）：**

```json
{
  "ip": "240e:3b7:3272:d8d0:db09:c067:8d59:539e",
  "版本": 6,
  "国家": "中国",
  "省份": "广东省",
  "城市": "深圳市",
  "运营商": "电信",
  "国家代码": "CN",
  "位置": "广东 深圳",
  "原始数据": "中国|广东省|深圳市|电信|CN"
}
```

### 健康检查

```
GET /api/health
```

```json
{
  "状态": "正常",
  "IPv4已就绪": true,
  "IPv6已就绪": true,
  "IPv4数据更新时间": "2026-04-13T01:36:00.000Z",
  "IPv6数据更新时间": "2026-04-13T01:36:02.000Z"
}
```

### 首页

```
GET /
```

```json
{
  "服务": "ip2region-api",
  "用法": "/api/lookup?ip=8.8.8.8",
  "IPv4已就绪": true,
  "IPv6已就绪": true,
  "IPv4数据更新时间": "2026-04-13T01:36:00.000Z",
  "IPv6数据更新时间": "2026-04-13T01:36:02.000Z"
}
```

### 错误响应

| 状态码 | 场景 | 示例 |
|--------|------|------|
| 400 | 未提供 IP | `{"错误":"缺少IP","说明":"请提供 ip 参数"}` |
| 400 | 无效 IP | `{"错误":"无效IP","说明":"无效的 IP 地址: abc"}` |
| 401 | 认证失败 | `{"错误":"未授权","说明":"认证失败"}` |
| 404 | 路径不存在 | `{"错误":"未找到","说明":"请求的路径不存在"}` |
| 503 | 数据库未加载 | `{"错误":"服务不可用","说明":"IPv4 数据库未加载"}` |

---

## 首次部署（从零开始）

### 前提条件

- 一个 Cloudflare 账号（免费注册：https://dash.cloudflare.com/sign-up）
- 电脑已安装 Node.js 18+

### 第 1 步：安装依赖

```powershell
cd ip-api-service-cf
npm install
```

### 第 2 步：登录 Cloudflare

```powershell
npx wrangler login
```

浏览器会自动打开，点击 **Allow** 授权。

### 第 3 步：创建 R2 存储桶

R2 是 Cloudflare 的对象存储服务，用来存放 xdb 数据文件。

```powershell
npx wrangler r2 bucket create ip2region-db
```

看到 `Created bucket` 表示成功。

### 第 4 步：上传 xdb 数据文件到 R2

```powershell
npx wrangler r2 object put ip2region-db/ip2region_v4.xdb --file data/ip2region_v4.xdb --remote
npx wrangler r2 object put ip2region-db/ip2region_v6.xdb --file data/ip2region_v6.xdb --remote
```

> **注意：** 必须加 `--remote` 参数，否则只上传到本地模拟环境。必须在 `ip-api-service-cf` 目录下运行，否则找不到 `data/` 文件夹。

看到上传进度条完成即可。

### 第 5 步：部署 Worker

```powershell
npx wrangler deploy
```

部署成功后终端会输出你的 API 地址：

```
Published rituxip (x.xx sec)
  https://rituxip.你的名字.workers.dev
```

### 第 6 步：验证

在浏览器中打开：

```
https://rituxip.你的名字.workers.dev/api/lookup?ip=113.118.113.77
```

第一次请求会稍慢（从 R2 加载数据），之后就会很快。

---

## 更新 xdb 数据文件

ip2region 的数据会不定期更新。有三种更新方式：

### 方法一：GitHub Actions 自动更新（推荐，全自动）

项目已配置 GitHub Actions 工作流，按 `cron: 0 3 * * 1` 自动检查 ip2region 仓库是否有更新，如果有就自动下载新 xdb 并上传到 R2。
这表示：
- UTC 时间：每周一 03:00
- 北京时间（UTC+8）：每周一 11:00

**设置步骤：**

1. 把 `ip-api-service-cf` 项目推送到你的 GitHub 仓库

2. 获取 Cloudflare API Token：
   - 打开 https://dash.cloudflare.com/profile/api-tokens
   - 点击 **Create Token**
   - 选择 **Edit Cloudflare Workers** 模板
   - 确保权限包含：`Workers R2 Storage:Edit`、`Workers Scripts:Edit`
   - 创建后复制 Token

3. 在 GitHub 仓库中配置 Secret：
   - 打开你的 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
   - 点击 **New repository secret**
   - 名称填 `CLOUDFLARE_API_TOKEN`，值填刚才复制的 Token
   - 点击 **Add secret**

4. 完成！之后每周一会自动检查更新。你也可以在仓库的 **Actions** 页面手动点击 **Run workflow** 立即触发。

**工作流程：**

```
每周一 11:00（北京时间，或手动触发）
    ↓
检查 ip2region 仓库是否有新 commit
    ↓
有更新 → 下载新 xdb → 上传到 R2 → 记录 commit
无更新 → 跳过
```

### 方法二：命令行手动上传

1. 去 [ip2region Releases](https://github.com/lionsoul2014/ip2region/releases) 页面下载最新版本的 `ip2region_v4.xdb` 和 `ip2region_v6.xdb`

2. 把下载的文件放到 `ip-api-service-cf/data/` 目录下（覆盖旧文件）

3. 重新上传到 R2（会自动覆盖旧数据）：

```powershell
cd ip-api-service-cf
npx wrangler r2 object put ip2region-db/ip2region_v4.xdb --file data/ip2region_v4.xdb --remote
npx wrangler r2 object put ip2region-db/ip2region_v6.xdb --file data/ip2region_v6.xdb --remote
```

4. Worker 下次冷启动时会自动使用新数据。如果想立即生效，重新部署即可：

```powershell
npx wrangler deploy
```

### 方法三：Cloudflare Dashboard 手动上传

1. 打开 https://dash.cloudflare.com
2. 左侧菜单 → **R2 Object Storage** → 点击 `ip2region-db` 存储桶
3. 点击 **Upload** → 选择新的 xdb 文件上传（会自动覆盖同名文件）

### 查看当前数据版本

访问 `/api/health` 可以看到数据的上传时间：

```json
{
  "状态": "正常",
  "IPv4已就绪": true,
  "IPv6已就绪": true,
  "IPv4数据更新时间": "2026-04-13T01:36:00.000Z",
  "IPv6数据更新时间": "2026-04-13T01:36:02.000Z"
}
```

---

## 设置访问密码（可选）

如果不希望任何人都能调用 API，可以设置密码：

1. 打开 https://dash.cloudflare.com
2. 左侧菜单 → **Workers & Pages** → 点击 `rituxip`
3. 点击 **Settings** → **Variables and Secrets**
4. 点击 **Add** → 名称填 `AUTH_TOKEN`，值填你想要的密码（如 `my-secret-123`）
5. 选择 **Encrypt** → 点击 **Save**
6. 点击 **Deploy** 使配置生效

设置后，调用 API 需要带上密码：

```
# 方式1：URL 参数
https://你的域名/api/lookup?ip=8.8.8.8&token=my-secret-123

# 方式2：HTTP Header
Authorization: Bearer my-secret-123
```

---

## 缓存机制说明

### 数据加载策略

| 版本 | 加载时机 | 大小 | 说明 |
|------|---------|------|------|
| IPv4 | 首次访问 `/`、`/api/health` 或 IPv4 查询时加载 | ~10 MB | 会缓存到 Worker 内存 |
| IPv6 | 首次访问 `/`、`/api/health` 或 IPv6 查询时加载 | ~34 MB | 会缓存到 Worker 内存 |

### 缓存生命周期

```
首次请求 → 从 R2 加载到 Worker 内存（1-3秒）→ 返回结果
后续请求 → 直接用内存缓存（微秒级）→ 返回结果
    ↓
Worker 实例持续运行（有流量就不会被回收）
    ↓
长时间无流量 → Worker 被回收 → 下次请求重新从 R2 加载
```

- 只要有持续流量，Worker 实例会保持活跃，数据一直在内存中
- 长时间无请求时 Worker 可能被回收，下次请求需要重新加载
- IPv4 只需加载 10MB，冷启动很快

---

## 自动化链路说明

这个项目有两条独立自动化链路，职责不同：

1. GitHub Actions（`.github/workflows/update-data.yml`）
- 负责：检查上游 `ip2region` 是否更新，下载新 xdb，上传到 R2。
- 触发：`cron: 0 3 * * 1`（UTC 周一 03:00 = 北京时间周一 11:00）或手动运行。
- 特性：如果上游没有新 commit，本周不会改动 R2，也不会新增 commit。

2. Cloudflare Git 连接（Workers Dashboard）
- 负责：当仓库代码变更时，自动部署 Worker 代码。
- 关键配置：根目录必须是 `ip-api-service-cf`，否则可能找不到 `wrangler.toml`。
- 注意：这条链路不负责更新 R2 数据文件，R2 更新由 GitHub Actions 负责。

---

## 常见故障排查

### 1) Actions 报错：`Unrecognized named-value: 'secrets'`

- 原因：在 `if:` 表达式里直接使用 `secrets.*`。
- 处理：改为在 `env` 注入 secret，再在 `run` 脚本里判断是否为空。

### 2) 首页显示“IPv4数据更新时间/IPv6数据更新时间：未加载”

- 原因：Worker 还没完成首次加载，或刚冷启动。
- 处理：
  - 先访问 `/` 或 `/api/health`（会触发预热加载）。
  - 确认 R2 中存在 `ip2region_v4.xdb`、`ip2region_v6.xdb`。
  - 若仍异常，查看 `npx wrangler tail` 日志。

### 3) 上传 R2 失败

- 检查项：
  - GitHub Secret `CLOUDFLARE_API_TOKEN` 是否存在。
  - Token 权限是否包含 `Workers R2 Storage:Edit`。
  - R2 存储桶名是否为 `ip2region-db`。
  - 工作流运行目录是否为 `ip-api-service-cf`（需能读到 `wrangler.toml`）。

### 4) Cloudflare 部署失败（Git 集成）

- 检查项：
  - 根目录是否配置为 `ip-api-service-cf`。
  - `wrangler.toml` 中 `name` 是否与面板 Worker 名称一致（当前为 `rituxip`）。
  - Dashboard 的构建/部署命令是否为 `npx wrangler deploy`。

---

## 运维检查清单

建议每周至少检查一次：

1. GitHub Actions 最近一次运行状态是否成功。
2. R2 存储桶 `ip2region-db` 是否有 `ip2region_v4.xdb`、`ip2region_v6.xdb`。
3. `https://你的域名/api/health` 是否返回：
- `IPv4已就绪: true`
- `IPv6已就绪: true`
- `IPv4数据更新时间`、`IPv6数据更新时间` 为有效时间。
4. Cloudflare Worker 最新版本是否已跟随 `main` 分支部署。
5. 若有异常，先看：
- GitHub Actions 日志（数据更新链路）
- Cloudflare 部署日志与 `wrangler tail`（服务运行链路）

---

## 在你的项目中调用

### JavaScript / TypeScript

```typescript
async function getIpLocation(ip: string): Promise<string> {
  const response = await fetch(`https://你的域名/api/lookup?ip=${ip}`);
  const data = await response.json();
  return data.位置 || '未知';
}

// 使用
const location = await getIpLocation('113.118.113.77');
console.log(location); // "广东 深圳"
```

### Python

```python
import requests

def get_ip_location(ip: str) -> str:
    resp = requests.get(f'https://你的域名/api/lookup?ip={ip}')
    data = resp.json()
    return data.get('位置', '未知')
```

### cURL

```bash
curl "https://你的域名/api/lookup?ip=8.8.8.8"
```

---

## 常用命令速查

| 操作 | 命令 |
|------|------|
| 安装依赖 | `npm install` |
| 本地开发测试 | `npx wrangler dev` |
| 部署到线上 | `npx wrangler deploy` |
| 查看实时日志 | `npx wrangler tail` |
| 创建 R2 存储桶 | `npx wrangler r2 bucket create ip2region-db` |
| 上传 IPv4 数据 | `npx wrangler r2 object put ip2region-db/ip2region_v4.xdb --file data/ip2region_v4.xdb --remote` |
| 上传 IPv6 数据 | `npx wrangler r2 object put ip2region-db/ip2region_v6.xdb --file data/ip2region_v6.xdb --remote` |
| 查看 R2 存储桶列表 | `npx wrangler r2 bucket list` |
| 查看 R2 对象列表 | `npx wrangler r2 object get ip2region-db/ --remote` |

---

## Cloudflare 免费额度

| 资源 | 免费额度 |
|------|---------|
| Workers 请求 | 10 万次/天 |
| Workers CPU 时间 | 10 毫秒/次 |
| R2 存储 | 10 GB |
| R2 读取 | 100 万次/月 |
| R2 写入 | 100 万次/月 |

当前 xdb 数据文件总共约 45MB，远低于 10GB 免费额度。

---

## 项目结构

```
ip-api-service-cf/
├── .github/
│   └── workflows/
│       └── update-data.yml  # GitHub Actions 自动更新工作流
├── src/
│   └── index.js              # Worker 主代码（自包含搜索逻辑，不依赖 fs）
├── data/                      # xdb 数据文件（不上传到 Git）
│   ├── ip2region_v4.xdb       # IPv4 数据库 (~10MB)
│   └── ip2region_v6.xdb       # IPv6 数据库 (~34MB)
├── wrangler.toml              # Cloudflare Workers 配置
├── package.json               # 项目依赖
├── .gitignore                 # Git 忽略规则
└── README.md                  # 本文档
```

---

## 数据来源

IP 数据来自 [ip2region](https://github.com/lionsoul2014/ip2region/) 开源项目，数据格式为 `国家|省份|城市|运营商|ISO国家代码`。

- 中国地区：全中文输出
- 非中国地区：全英文输出
