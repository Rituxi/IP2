# rituxip

Cloudflare Worker `rituxip` 的正式地址为 `https://dyna.qzz.io`。IN 继续使用 `https://rituxi.dpdns.org`，两个域名指向同一生产 Worker。

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

### 台北日期与时间戳

`GET /api/time` 返回 `{"ok":true,"unixMs":1794499200000,"date":"2026-11-13"}`。时间戳与日期来自同一时刻，`date` 为 `Asia/Taipei` 的 `YYYY-MM-DD`。响应为 `Cache-Control: no-store`。

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

两个自定义域名在 Cloudflare 的 `rituxip` 域名设置中管理。`wrangler.toml` 保持 `workers.dev` 和预览入口关闭。Git 自动发布的项目根目录为 `ip-api-service-cf`。手动发布前用 `npx wrangler whoami` 确认账号，再运行 `npx wrangler deploy`。发布后检查新域名的三个接口和旧域名的 IP 查询。

Cloudflare 缓存规则若覆盖了响应头，需要让 `/api/time` 绕过缓存。机型接口的缓存键须包含 `brand` 和 `model`。 [Cloudflare 缓存规则](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)

## 数据维护

### IP 数据

`.github/workflows/update-data.yml` 每周一台北时间 11:00 检查 ip2region 上游，有更新时上传两份 xdb 到 `ip2region-db`。也可在 Actions 手动触发。

手动更新时，下载新的 xdb 到当前目录的 `data/`，在确认目标账号后上传。Worker 在下次冷启动时读取新对象，可通过 `/api/health` 查看上传时间。 [ip2region 数据](https://github.com/lionsoul2014/ip2region/tree/master/data)

```powershell
npx wrangler r2 object put ip2region-db/ip2region_v4.xdb --file data/ip2region_v4.xdb --remote
npx wrangler r2 object put ip2region-db/ip2region_v6.xdb --file data/ip2region_v6.xdb --remote
```

### 手机型号字典

GitHub Actions 的 `Update Device Models` 每天台北时间 10:17 检查 `models.csv`。上游有更新且校验通过后，才替换 `ip2region-db` 中的 `device-models/mobilemodels.json`。字典记录来源提交、许可、覆盖量和最后成功发布时间。同步失败时保留上一份正常字典，详情见 Actions 日志。可手动运行，勾选 `rebuild` 可用同一版本重新生成。 [Update Device Models](https://github.com/Rituxi/IP2/actions/workflows/update-device-models.yml)

生产配置使用 `MOBILEMODELS_ENABLED = "true"`，GitHub 仓库变量 `MOBILEMODELS_PRODUCTION_ENABLED` 设为 `true`。IP 和机型同步共用 `CLOUDFLARE_ACCOUNT_ID` 和有 R2 读写权限的 `CLOUDFLARE_API_TOKEN`。Worker 按需读取机型字典，每 5 分钟检查更新。读取失败时沿用实例内的旧字典，响应禁止缓存，30 秒后重试。更新字典无需重新部署 Worker。

字典只导入手机，按完整型号匹配。`V2408A` 可用 `vivo` 或 `iQOO` 查询。已知等价的中英文名合并，有多个候选时返回未命中。 [小米智利监管列表](https://www.mi.com/cl/regulatoryinfo/subtel/) · [Motorola 合规声明](https://en-emea.support.motorola.com/app/answers/detail/a_id/167829/p/11132)

内置字典补充上游缺少的型号。内置 iPhone 字典来自 AppleDB（MIT），可用 `npm run update:device-models` 重建。安卓条目的来源和许可见 `src/device-models/android.json`。 [AppleDB 许可](src/device-models/LICENSE-AppleDB.txt) · [LineageOS Wiki 许可声明](https://github.com/LineageOS/lineage_wiki/blob/f33424ecc81eb1125a433419cb88ef4a5fa7f8ca/_includes/layout/footer.html)

#### 数据许可

`MobileModels-csv` 及其上游采用 **CC BY-NC-SA 4.0**。非商业使用需保留署名、来源与许可链接，并注明改编。分享改编字典时沿用相同许可。商业用途需另获授权。同步会检查上游和对应 CSV 版本的许可，发现变化就保留现有字典。 [CSV 仓库许可](https://github.com/KHwang9883/MobileModels-csv/blob/main/LICENSE) · [许可全文](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en)

本地运行 `npm run sync:device-models -- --validate` 可检查真实上游。要测试本地 R2，可在 `--validate` 后传入 `.wrangler/` 下的字典输出路径。

## 微信小程序接入

在微信后台的 `request` 合法域名加入 `https://dyna.qzz.io`。

- IP 归属地 [https://dyna.qzz.io/api/lookup?ip=113.118.113.77](https://dyna.qzz.io/api/lookup?ip=113.118.113.77)
- 可信日期 [https://dyna.qzz.io/api/time](https://dyna.qzz.io/api/time)
- 手机商品名 [https://dyna.qzz.io/api/device-model?brand=vivo&model=V2408A](https://dyna.qzz.io/api/device-model?brand=vivo&model=V2408A)

时间请求成功后读取 `date` 和 `unixMs`，沿用原有超时和回退。历史备份按每条快照的 `device.brand`、`device.model`（兼容 `device_brand`、`device_model`）异步查询，对参数做 URL 编码。请求成功且 `matched: true` 时，核对当前账号、快照和型号后更新显示，保留系统标签。失败、超时或未命中时保留原显示。查询不阻塞备份和恢复，原始型号和设备身份继续使用原字段。使用 MobileModels 的界面保留来源与许可署名，API 的 `Link` 响应头提供来源和许可链接。

接入后用真机验证可信日期和不同来源设备的历史备份，确认查询失败时仍可备份和恢复。
