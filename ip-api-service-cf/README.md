# rituxip

Cloudflare Worker，生产地址为 `https://rituxi.dpdns.org`。IP 查询读取 R2 中的 xdb。时间取自 Worker 时钟，机型查询使用随代码发布的字典，这两个接口都无需读取 R2。

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
| 200 | 唯一命中 | `{"ok":true,"matched":true,"displayName":"iPhone 16 Pro"}` | 24 小时 |
| 200 | 未收录或有歧义 | `{"ok":true,"matched":false,"displayName":null}` | 5 分钟 |
| 400 | 缺参、空值或重复参数 | `{"ok":false,"matched":false,"displayName":null,"error":"invalid_parameters"}` | `no-store` |

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

- iPhone 数据来自 AppleDB，使用 MIT 许可。运行 `npm run update:device-models` 可按固定提交重建。更新上游时先核对许可，再运行 `npm run update:device-models -- <gh-pages 的完整提交 SHA>` 并检查差异。脚本将同一商品的地区版本归到共同名称。 [AppleDB 数据说明](https://github.com/littlebyteorg/appledb/blob/main/API.md) · [MIT 许可](src/device-models/LICENSE-AppleDB.txt)
- 安卓为精选覆盖。按 `src/device-models/android.json` 中的 `source` 逐条核对并更新品牌、商品名和完整型号。LineageOS Wiki 摘录注明版本，沿用 CC BY-SA 3.0。其余条目是从厂商资料核实的型号事实。新增条目时记录来源及许可或事实出处。有多个候选商品名时保留候选，由接口返回未命中。 [LineageOS Wiki 许可声明](https://github.com/LineageOS/lineage_wiki/blob/f33424ecc81eb1125a433419cb88ef4a5fa7f8ca/_includes/layout/footer.html)
- 字典未导入采用 CC BY-NC-SA 4.0 的 MobileModels。`25113PN0EG` 因小米智利监管列表对应两个名称而暂不收录。 [MobileModels 许可](https://github.com/KHwang9883/MobileModels/blob/master/README_en.md) · [小米智利监管列表](https://www.mi.com/cl/regulatoryinfo/subtel/)

字典更新后运行 `npm test`，随 Worker 代码发布。

## 微信小程序接入

1. 将生产 HTTPS 域名加入微信后台的 `request` 合法域名。可信时间改用 `/api/time`，收到 HTTP 200 和 `ok: true` 后读取 `date`、`unixMs`，沿用原有超时和回退。
2. 历史备份先按原规则显示。用每条快照的来源设备字段 `device.brand` 和 `device.model` 查询，兼容旧字段 `device_brand`、`device_model`。只发送这两个值并做 URL 编码。字段缺失时保留原显示。
3. 查询异步执行，备份和恢复可以照常操作。仅在请求成功且 `matched: true` 时更新显示名称，保留系统标签。回写前核对账号、快照和品牌型号。失败、超时或未命中时保留原显示。原始型号、备份内容和设备身份继续使用原字段。
4. 真机验证可信日期，并打开含不同来源设备的历史列表，检查命中、未命中和请求失败时的显示，以及备份和恢复操作。
