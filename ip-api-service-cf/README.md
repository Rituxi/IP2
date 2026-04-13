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
  "IPv6已就绪": false
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
  "IPv4已就绪": false,
  "IPv6已就绪": false
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
Published ip2region-api (x.xx sec)
  https://ip2region-api.你的名字.workers.dev
```

### 第 6 步：验证

在浏览器中打开：

```
https://ip2region-api.你的名字.workers.dev/api/lookup?ip=113.118.113.77
```

第一次请求会稍慢（从 R2 加载数据），之后就会很快。

---

## 更新 xdb 数据文件

ip2region 的数据会不定期更新。更新方法：

### 方法一：命令行上传（推荐）

1. 去 [ip2region Releases](https://github.com/lionsoul2014/ip2region/releases) 页面下载最新版本的 `ip2region_v4.xdb` 和 `ip2region_v6.xdb`

2. 把下载的文件放到 `ip-api-service-cf/data/` 目录下（覆盖旧文件）

3. 重新上传到 R2（会自动覆盖旧数据）：

```powershell
cd ip-api-service-cf
npx wrangler r2 object put ip2region-db/ip2region_v4.xdb --file data/ip2region_v4.xdb --remote
npx wrangler r2 object put ip2region-db/ip2region_v6.xdb --file data/ip2region_v6.xdb --remote
```

4. Worker 下次冷启动时会自动使用新数据。如果想立即生效，可以在 Cloudflare Dashboard 中重启 Worker：
   - 打开 https://dash.cloudflare.com
   - 左侧菜单 → **Workers & Pages** → 点击 `ip2region-api`
   - 点击右上角 **···** → **Rollback** 或重新部署

### 方法二：Cloudflare Dashboard 手动上传

1. 打开 https://dash.cloudflare.com
2. 左侧菜单 → **R2 Object Storage** → 点击 `ip2region-db` 存储桶
3. 点击 **Upload** → 选择新的 xdb 文件上传（会自动覆盖同名文件）

---

## 设置访问密码（可选）

如果不希望任何人都能调用 API，可以设置密码：

1. 打开 https://dash.cloudflare.com
2. 左侧菜单 → **Workers & Pages** → 点击 `ip2region-api`
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
| IPv4 | 首次查询时自动加载 | ~10 MB | 默认加载，绝大多数用户是 IPv4 |
| IPv6 | 首次查询 IPv6 地址时加载 | ~34 MB | 按需加载，不查 IPv6 就不占内存 |

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
├── src/
│   └── index.js          # Worker 主代码（自包含搜索逻辑，不依赖 fs）
├── data/                  # xdb 数据文件（不上传到 Git）
│   ├── ip2region_v4.xdb   # IPv4 数据库 (~10MB)
│   └── ip2region_v6.xdb   # IPv6 数据库 (~34MB)
├── wrangler.toml          # Cloudflare Workers 配置
├── package.json           # 项目依赖
├── .gitignore             # Git 忽略规则
└── README.md              # 本文档
```

---

## 数据来源

IP 数据来自 [ip2region](https://github.com/lionsoul2014/ip2region/) 开源项目，数据格式为 `国家|省份|城市|运营商|ISO国家代码`。

- 中国地区：全中文输出
- 非中国地区：全英文输出
