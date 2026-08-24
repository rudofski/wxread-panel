# wxread curl_bash 获取器（Chrome 扩展）

在微信读书阅读页**翻一页**即可捕获真实阅读上报请求，生成**含完整登录凭证（含 HttpOnly cookie）**的 curl_bash，直接填入控制面板 `WXREAD_CURL_BASH` 即可刷时长。

## 为什么需要它

微信读书把 `wr_vid` / `wr_skey` / `wr_rt` 设为 **HttpOnly Cookie**——浏览器禁止任何网页脚本（包括书签小工具）读取，导致书签生成的 curl 缺少登录凭证、无法刷时长。**Chrome 扩展不受此限制**：

- `webRequest.onBeforeSendHeaders`（观察模式，含 `extraHeaders`）捕获**浏览器真实发出的 Cookie 头**（含 HttpOnly）——与 F12 复制/显示的 curl **严格同源**（同一请求的同一 Cookie 头）
- content script 捕获页面真实发出的 `x-wrpa-0` 签名头与请求体
- URL 自动补全为绝对地址，生成的完整 curl 与 F12「Copy as cURL」**完全一致**

## 安装（开发者模式加载，无需上架商店）

1. 下载/解压本仓库（或只下载 `chrome-extension/` 整个文件夹）
2. 打开 Chrome，地址栏输入 `chrome://extensions` 回车
3. 打开右上角 **开发者模式** 开关
4. 点击 **加载已解压的扩展程序**，选择 `chrome-extension` 文件夹
5. 扩展出现在工具栏（🎣 图标）即安装成功

## 使用

1. 打开 [微信读书网页版](https://weread.qq.com/) 并扫码登录，进入任意一本书的**阅读页**
2. 在阅读页**翻一页**（触发阅读上报请求）
3. 点击工具栏 🎣 图标 → 弹窗已自动生成完整 curl_bash（含 HttpOnly 凭证提示）
4. 点击 **📋 复制 curl_bash**
5. 粘贴到控制面板 → 配置参数 → 微信读书接口 → `WXREAD_CURL_BASH` → 保存

## 权限说明

| 权限 | 用途 |
|------|------|
| `webRequest`（观察 only） | 捕获微信读书阅读上报请求**真实发出的 Cookie 头**（含 HttpOnly `wr_skey` 等，与 F12 同源） |
| `storage` | 暂存最近一次捕获的 curl，供弹窗展示 |
| `clipboardWrite` | 点击「复制」按钮写入剪贴板 |

（`cookies` 权限保留备用；`https://weread.qq.com/*` host 权限限定仅微信读书域。）仅读取微信读书发出的请求头，不读取其他网站数据；捕获的数据仅保存在本机扩展存储中，不会上传。

## 文件结构

```
chrome-extension/
├── manifest.json        # MV3 清单（cookies 权限 + MAIN world content script）
├── content-main.js      # 页面主世界：hook fetch/XHR 捕获 x-wrpa-0 与请求体
├── content-bridge.js    # 桥接：转发捕获消息给 service worker
├── background.js        # 后台：cookies API 读 HttpOnly + 合并生成完整 curl
├── popup.html / popup.js# 弹窗：展示 + 复制 curl_bash
└── README.md
```

## 疑难排查

- **提示"未读到 wr_skey"**：登录态过期，回到阅读页刷新后重新登录微信读书再试
- **没有捕获到任何内容**：确认在阅读页翻了一页（触发 `/web/book/read` 请求）；必要时刷新页面重试
- **其他浏览器**：Firefox/Edge 加载方式类似（about:debugging / edge://extensions），cookies API 行为一致
