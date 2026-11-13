# rituxip

Cloudflare Worker，生产地址为 `https://rituxi.dpdns.org`。IP 查询读取 R2 中的 xdb，时间取自 Worker 时钟，机型查询可独立使用同一 R2 桶中的机型字典。

## 接口

### IP 归属地

`GET /api/lookup?ip=113.118.113.77`，支持 IPv4 和 IPv6。

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

响应缓存 1 小时。若配置 `AUTH_TOKEN`，可通过 `Authorization: Bearer <token>` 或 `token` 参数鉴权。IN 当前调用不带 token，优先读取 `位置`，生产发布沿用现有鉴权配置。

`GET /api/health` 和 `GET /` 会预加载两份 xdb。查看 `IPv4已就绪`、`IPv6已就绪` 和数据更新时间可确认 R2 数据是否已载入。

### 北京时间

`GET /api/time` 返回 `{"ok":true,"unixMs":1794499200000,"date":"2026-11-13"}`。时间戳与日期来自同一时刻，`date` 为 `Asia/Shanghai` 的 `YYYY-MM-DD`。响应为 `Cache-Control: no-store`。

### 手机商品名

`GET /api/device-model?brand=Apple&model=iPhone17%2C1`。两个参数各传一次，去除首尾空白并忽略大小写后按完整值匹配。品牌别名以字典为准。

| HTTP | 场景 | 响应 | 缓存 |
| --- | --- | --- | --- |
| 200 | 唯一命中 | `{"ok":true,"matched":true,"displayName":"iPhone 16 Pro"}` | R2 模式最多 5 分钟，内置模式 24 小时 |
| 200 | 未收录或有歧义 | `{"ok":true,"matched":false,"displayName":null}` | 最多 5 分钟 |
| 400 | 缺参、空值或重复参数 | `{"ok":false,"matched":false,"displayName":null,"error":"invalid_parameters"}` | `no-store` |
| 503 | R2 字典不可用，且当前实例无可用缓存 | `{"ok":false,"matched":false,"displayName":null,"error":"catalog_unavailable"}` | `no-store` |

时间和机型接口公开，仅接受 `GET`，其他方法返回 `405` 和 `Allow: GET`。

## 本地检查与发布

在 `ip-api-service-cf` 目录使用 Node.js 22 或更高版本。

```powershell
npm ci
npm test
npx wrangler deploy --dry-run
```

已有 `rituxip` 的域名、R2 和鉴权由当前 Cloudflare 配置管理。Git 自动发布的项目根目录为 `ip-api-service-cf`。手动发布时先用 `npx wrangler login` 授权，再用 `npx wrangler whoami` 确认账号。只更新 Worker 版本时，运行 `npx wrangler versions upload`，再用 `npx wrangler versions deploy <版本ID>@100%` 发布。发布后用正式域名验证 `/api/health`、IPv4/IPv6 查询和机型命中、未命中。对同一 `/api/time` URL 间隔几秒发起两次 GET，两次都应返回 `no-store`，第二次的 `unixMs` 应更大。

Cloudflare 缓存规则若覆盖了响应头，需要让 `/api/time` 绕过缓存。机型接口的缓存键须包含 `brand` 和 `model`。 [Cloudflare 缓存规则](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)

## 数据维护

### IP 数据

仓库根目录的 `.github/workflows/update-data.yml` 每周一北京时间 11:00 检查 ip2region 上游，有更新时上传两份 xdb 到 `ip2region-db`。也可在 Actions 手动触发。工作流使用 `CLOUDFLARE_ACCOUNT_ID` 和具备 R2 写权限的 `CLOUDFLARE_API_TOKEN`。

手动更新时，下载新的 xdb 到当前目录的 `data/`，在确认目标账号后上传。Worker 在下次冷启动时读取新对象，可通过 `/api/health` 查看上传时间。 [ip2region 数据](https://github.com/lionsoul2014/ip2region/tree/master/data)

```powershell
npx wrangler r2 object put ip2region-db/ip2region_v4.xdb --file data/ip2region_v4.xdb --remote
npx wrangler r2 object put ip2region-db/ip2region_v6.xdb --file data/ip2region_v6.xdb --remote
```

### 手机型号字典

GitHub Actions 的 `Update Device Models` 每天北京时间 10:17 检查 `models.csv` 的最新提交。提交变化时下载固定版本，校验许可、CSV 格式和可唯一匹配的型号数量，再一次替换 `ip2region-db` 中的 `device-models/mobilemodels.json`。对象内记录来源提交、许可、覆盖量和最后成功发布时间。同步失败时查看 Actions 日志，上一份正常字典继续服务。修正转换规则后，可手动运行并勾选 `rebuild`，用同一份 CSV 重新生成。

启用 R2 模式后，Worker 首次收到有效机型查询时加载字典，每 5 分钟按 ETag 检查更新。HTTP 缓存只用剩余有效期。读取失败时沿用实例内最近一次成功数据，旧响应不缓存，30 秒后重试。正常查询不访问 GitHub。

字典只导入手机，使用完整型号和 `iPhone17,1` 这类苹果标识。品牌别名按产品登记，`V2408A` 可用 `vivo` 或 `iQOO` 查询。已知等价的中英文名合并。多个候选或厂商资料冲突时返回未命中。 [小米智利监管列表](https://www.mi.com/cl/regulatoryinfo/subtel/) · [Motorola 合规声明](https://en-emea.support.motorola.com/app/answers/detail/a_id/167829/p/11132)

生产接入默认关闭。启用后，内置字典用于补充上游缺少的型号。内置 iPhone 字典来自 AppleDB（MIT），可用 `npm run update:device-models` 重建。安卓条目的来源和许可见 `src/device-models/android.json`。 [AppleDB 许可](src/device-models/LICENSE-AppleDB.txt) · [LineageOS Wiki 许可声明](https://github.com/LineageOS/lineage_wiki/blob/f33424ecc81eb1125a433419cb88ef4a5fa7f8ca/_includes/layout/footer.html)

#### 许可与启用条件

`MobileModels-csv` 及其上游采用 **CC BY-NC-SA 4.0**。非商业使用需保留署名、来源与许可链接，并注明改编。分享改编字典时沿用相同许可。商业用途需另获授权。同步会检查上游和对应 CSV 版本的许可，发现变化就保留现有字典。 [CSV 仓库许可](https://github.com/KHwang9883/MobileModels-csv/blob/main/LICENSE) · [许可全文](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en)

1. 开发验证运行 `npm test` 和 `npm run sync:device-models -- --validate`。后者读取真实上游，生成结果留在内存，可在 `--validate` 后传入 `.wrangler/` 下的文件路径供本地 R2 验收。
2. 许可适用后，确认小程序和服务的署名展示。在 GitHub Actions 配置 `CLOUDFLARE_ACCOUNT_ID`、具备 Workers R2 Storage 读写权限的 `CLOUDFLARE_API_TOKEN`，并将仓库变量 `MOBILEMODELS_PRODUCTION_ENABLED` 设为 `true`。手动运行一次 `Update Device Models`，确认首份字典和版本记录。
3. 在 `wrangler.toml` 的 `[vars]` 下设置 `MOBILEMODELS_ENABLED = "true"`，再部署新版 Worker。验证 `vivo/iQOO + V2408A`、原有机型和未命中。切换时，旧机型命中的客户端缓存最多保留 24 小时。后续更新无需重新部署 Worker。恢复内置模式时把 Worker 变量改为 `"false"` 并发布，停止生产同步时关闭 GitHub 变量。

## 微信小程序接入

1. 将生产 HTTPS 域名加入微信后台的 `request` 合法域名。可信时间改用 `/api/time`，收到 HTTP 200 和 `ok: true` 后读取 `date`、`unixMs`，沿用原有超时和回退。
2. 历史备份先按原规则显示。用每条快照的来源设备字段 `device.brand` 和 `device.model` 查询，兼容旧字段 `device_brand`、`device_model`。只发送这两个值并做 URL 编码。字段缺失时保留原显示。
3. 查询异步执行，备份和恢复可以照常操作。仅在请求成功且 `matched: true` 时更新显示名称，保留系统标签。回写前核对账号、快照和品牌型号。失败、超时或未命中时保留原显示。原始型号、备份内容和设备身份继续使用原字段。采用 MobileModels 后在使用结果的界面提供来源与许可署名，API 的 `Link` 响应头也带来源版本及许可。
4. 真机验证可信日期，并打开含不同来源设备的历史列表，检查命中、未命中和请求失败时的显示，以及备份和恢复操作。
