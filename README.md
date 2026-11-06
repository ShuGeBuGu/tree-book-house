# Tree Book House · 树屋

一个不需要服务器、不会自己关机的静态照片下载站。访客推开门，就能按分组浏览照片；点开照片后，可以下载高清版、轻巧版，以及一段静音循环的动态背景视频。

- **网站地址**：<https://shugebugu.github.io/tree-book-house/>
- **管理台**：<https://shugebugu.github.io/tree-book-house/admin.html>
- **GitHub 仓库**：<https://github.com/ShuGeBuGu/tree-book-house>
- **状态**：已上传、已开启 GitHub Pages、已上线；管理台首次使用需要一个仅授权本仓库的 Token（见 [DEPLOY.md](DEPLOY.md) 第 4 步）。

欢迎页、相册、弹窗和上传台都使用同一套奶油糖果色视觉，已经做了手机与电脑适配，并尊重系统的“减少动态效果”设置。

---

## 目录里有什么

```text
C:\TBH
├─ index.html               欢迎页 + 相册（访客看到的网站）
├─ admin.html               树屋管理室（只给自己用）
├─ 404.html                 找不到页面时的提示页
├─ data/
│  └─ gallery.json          照片清单：标题、分组、尺寸、下载地址
├─ media/
│  └─ demo/                 5 张示例插画和它们的动态视频
├─ assets/
│  ├─ brand/                 Logo、favicon、社交分享图
│  ├─ css/style.css         前台样式（颜色、字体、布局）
│  ├─ css/admin.css         管理台样式
│  ├─ js/app.js             前台交互
│  └─ js/admin.js           管理台：压缩、生成视频、提交到 GitHub
├─ README.md
└─ DEPLOY.md                免费上线和后续使用的完整步骤
```

> `media/demo` 里的 5 张图是**示例内容**，不是你要展示的照片。连接仓库后，在「树屋里的照片」里点 **移除全部示例内容** 即可清空。

---

## 它是怎么做到不花服务器钱的？

网站本身是纯静态文件（HTML + CSS + JS + 图片），发布在 **GitHub Pages** 或 **Cloudflare Pages** 上，不需要一直开着你的电脑。

管理台上传照片时，浏览器会在本地完成这些事：

1. 自动读取照片的原始分辨率；
2. 生成 `large`（长边最大 2560px，高清）和 `web`（长边最大 1280px，轻巧）两个 JPG；
3. 生成一段 6 秒、静音的循环动态视频（优先 MP4，浏览器不支持时用 WebM）；
4. 通过 GitHub API 把图片、视频和更新后的 `data/gallery.json` 一次性提交到你的仓库；
5. GitHub Pages 自动重新发布，网站就更新了。

整个过程只有一个静态网站和一个 GitHub 仓库，没有传统服务器，也没有会过期的图床链接。

---

## 第一次使用（三步）

完整带截图级说明见 [DEPLOY.md](DEPLOY.md)，简单说是：

1. 把整个 `C:\TBH` 里的网站文件上传到一个 **公开的 GitHub 仓库**；
2. 在仓库 **Settings → Pages** 里选择从 `main` 分支根目录发布；
3. 打开 `https://你的用户名.github.io/仓库名/admin.html`，填入仓库名和一个只有该仓库 Contents 读写权限的 Fine-grained Token，开始上传照片。

视频和图片都在你的浏览器里生成，**不需要安装 ffmpeg，也不需要安装任何软件**。建议使用最新版 Chrome / Edge；Safari 也可以，但视频编码能力取决于系统版本。

---

## 日常使用

- 新照片：打开 `/admin.html` → 连接仓库 → 选择已有分组或新建分组 → 拖入照片 → 发布。
- 下架照片：管理台「树屋里的照片」中，点击照片右下角的 `×`。
- 删除全部示例：管理台里点「移除全部示例内容」。
- 改网站配色、欢迎语和 Logo：见下方「自定义」。

发布后 GitHub Pages 通常需要约 30 秒–1 分钟更新。若打开网站没变化，等一分钟再刷新；由于媒体文件名每次都是新的，不会出现图片缓存过期的问题。

---

## 自定义这个网站

### 1. 改颜色

打开 `assets/css/style.css`，最上面的 `:root` 里集中放了所有颜色：

```css
--cream: #fff8ef;       /* 奶油底色 */
--ink: #57433b;         /* 深棕文字 */
--pink-deep: #d992a4;   /* 主要强调色 */
--blue: #c8e4f6;        /* 天空蓝 */
--green: #cddfb5;       /* 树叶绿 */
--butter: #f7e4aa;      /* 太阳黄 */
```

管理台的配色在 `assets/css/admin.css`，变量名基本一致。

### 2. 改欢迎页文字

在 `index.html` 里搜索这些文字直接修改：

- `欢迎来到`
- `把喜欢的瞬间，藏在树叶和书页之间。`
- `推开门`
- `去树屋里逛逛`
- `树屋里的收藏`
- `一间不打烊的`

同时建议修改页面顶部 `<title>`、`meta description` 和 `og:image`，它们会出现在浏览器标签页和分享卡片里。

### 3. 换 Logo

当前 Logo 来自 `assets/brand/logo.webp`。如果你想换成别的图：

1. 把你的 Logo 导出为透明背景的 PNG 或 WebP；
2. 覆盖 `assets/brand/logo.webp`（同一个文件名，建议宽度 ≥ 800px）；
3. 同时替换 `assets/brand/favicon-32.png`、`favicon-180.png`、`icon-192.png`、`icon-512.png`；
4. `og.jpg` 是分享卡片图，可替换为 1200×630 的版本。

原始头像保存在 `assets/brand/logo-source.jpg`，没有被网站直接引用。

### 4. 改照片与分组

照片、标题、分组描述全部由管理台写入 `data/gallery.json`，不需要手改代码。

### 5. 改动态视频效果

在 `assets/js/admin.js` 里搜索 `drawLoopFrame`，调整缩放幅度、光斑数量、暗角即可。视频长度由 `VIDEO_SECONDS` 控制，默认 6 秒。

---

## 本地预览

浏览器出于安全原因不能直接双击打开 `index.html` 读取 JSON，需要起一个本地静态服务：

```powershell
cd C:\TBH
python -m http.server 8080
```

然后打开 <http://localhost:8080/>。预览结束后在终端按 `Ctrl+C`。

---

## 一些必须说清楚的事实

- **“永远”需要一个前提**：只要你的 GitHub 账号和仓库存在，静态文件就会一直可访问，不存在图片链接到期的问题。但没有任何免费服务能承诺“宇宙毁灭前一直在”。请保留一份原始照片的本地备份，并定期备份仓库。
- **免费额度**：GitHub Pages 对公开仓库免费，软限制大约是每月 100GB 流量和 1GB 仓库体积；GitHub 对单文件限制 100MB。按本项目一张照片约 0.5–3MB 的体积，存放几百张照片没有问题。照片特别多时，可以看 DEPLOY.md 里的 Cloudflare Pages 选项。
- **照片是公开的**：免费版 GitHub Pages 需要公开仓库。访客只能看到你上传的压缩版本，但任何拿到链接的人都可以下载。不要把私密照片放上来。
- **管理台是公开页面**：`admin.html` 任何人都能打开，但没有你的 Token 就无法提交改动。Token 只保存在你自己的浏览器中。
- **不要泄露 Token**：使用 Fine-grained Token，只给当前仓库的 `Contents: Read and write` 权限。公共电脑上不要勾选“记住配置”；如果 Token 泄露，去 GitHub 撤销并重新生成。
- **国内访问**：GitHub Pages 在中国大陆的部分网络下可能较慢。若主要访客在国内，可以按 DEPLOY.md 的 Cloudflare Pages 方案部署同一个仓库。

---

## 技术说明

- 零依赖、零构建：打开 HTML 就能运行；
- 无后端、无数据库；数据就是 Git 仓库里的 JSON 和文件；
- 上传时用 Canvas 完成缩放和 JPG 压缩；
- 用 `MediaRecorder` + Canvas 生成 6 秒循环视频；
- 用 GitHub Git Data API 一次性创建 blob / tree / commit / ref，保证一次发布是原子的；
- 前台支持键盘左右键切换照片、Esc 关闭、深链接 `?photo=照片id`；
- 动效遵循 `prefers-reduced-motion`。

---

Made for small, lovely moments.
