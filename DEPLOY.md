# 免费上线 · 从 0 到有网址

> **当前状态：已经由我完成第 1–3 步。**
>
> - 线上网站：<https://shugebugu.github.io/tree-book-house/>
> - 管理台：独立隐藏地址（已单独发给你，不在网站导航中）
> - 仓库：<https://github.com/ShuGeBuGu/tree-book-house>
>
> 现在只剩第 4–5 步：创建一个只授权本仓库的 Token，然后在管理台里连接一次。Token 是 GitHub 写入仓库所必需的安全凭证，GitHub 不允许网页仅凭登录状态就获得写入权限。

这份说明按“我什么都不会”的路径来写。整个过程只需要一个 GitHub 账号、浏览器，以及这个 `C:\TBH` 文件夹。

最终你会得到：

- 一个公开网址，例如 `https://xiaoyu.github.io/tree-book-house/`
- 一个只有你自己能修改的管理页：独立隐藏地址（没有从网站导航链接过去）
- 照片、视频、分组都存在你自己的 GitHub 仓库里，不需要服务器，不需要一直开着电脑

---

## 第 1 步：注册 GitHub 并建一个仓库

1. 打开 <https://github.com/>，注册账号并验证邮箱。
2. 登录后点击右上角 `+` → **New repository**。
3. 填写：
   - **Repository name**：例如 `tree-book-house`（只能使用英文、数字和连字符）
   - **Description**：可以随便写，例如 `My little photo tree house`
   - 选择 **Public**（公开）
   - 不用勾选 README / .gitignore / license
4. 点击 **Create repository**。

> 免费版 GitHub Pages 需要公开仓库。照片的压缩版本来就是给访客下载的，公开仓库不会额外暴露原图。

---

## 第 2 步：上传网站文件

### 方法 A：网页拖拽上传（最简单）

1. 在新建好的仓库页面，点击 **Add file → Upload files**。
2. 打开 Windows 资源管理器，进入 `C:\TBH`。
3. 选中以下内容，拖进 GitHub 网页的上传区域：
   - `index.html`
   - 后台管理页（隐藏地址，不公开链接）
   - `404.html`
   - `README.md`、`DEPLOY.md`（可选，但建议保留）
   - `assets` 文件夹
   - `data` 文件夹
   - `media` 文件夹
   - `robots.txt`
   - `site.webmanifest`
4. 等待文件列表出现，在底部填写提交信息（例如 `first upload`），点击 **Commit changes**。

> 如果拖拽文件夹不方便，可以先压缩成 zip 再解压后重新拖拽文件夹；GitHub 的上传页支持整个文件夹。
>
> `.nojekyll` 是 GitHub Pages 的配置文件，有些系统会自动隐藏。如果它没上传成功，网站一般也能正常打开，不强制。

### 方法 B：GitHub Desktop

1. 下载安装 <https://desktop.github.com/>；
2. 登录后选择 **Add an Existing Repository** → 选择 `C:\TBH`（如果还没有 Git 仓库，可以先在 GitHub 创建空仓库再克隆到本地，把文件复制进去）；
3. 提交并点击 **Push origin**。

---

## 第 3 步：打开 GitHub Pages，拿到网址

1. 进入仓库首页，点上方的 **Settings**。
2. 左侧点击 **Pages**。
3. 在 **Build and deployment** 下：
   - Source 选 **Deploy from a branch**
   - Branch 选 **main**，文件夹选 **/ (root)**
4. 点击 **Save**。
5. 等 30 秒–2 分钟，刷新页面，顶部会出现：
   - `Your site is live at https://你的用户名.github.io/tree-book-house/`

打开这个网址，应该能看到欢迎页。如果暂时 404，等几分钟再刷新，或者在仓库 **Actions** 里看部署进度。

> 仓库名如果叫 `你的用户名.github.io`，网址就是 `https://你的用户名.github.io/`，没有后面的子路径。后台管理页使用单独保存的隐藏地址，不在网站导航里。

---

## 第 4 步：创建一个只属于这个仓库的 Token

管理台需要向仓库写入照片，所以要一个 GitHub Token。**不要使用账号密码**，也不要给整个账号的权限。

1. 点击 GitHub 右上角头像 → **Settings**。
2. 左侧最下方 → **Developer settings**。
3. **Personal access tokens → Fine-grained tokens → Generate new token**。
4. 填写：
   - **Token name**：`tree-book-house-admin`
   - **Expiration**：建议 1 年，到期后重新生成一次；也可以选 No expiration（风险更高）
   - **Repository access**：选 **Only select repositories**，只勾选 `tree-book-house`
   - **Repository permissions**：
     - `Contents` → **Read and write**
     - `Metadata` → Read-only（默认即可）
   - 其他权限都不用给。
5. 点击 **Generate token**，复制以 `github_pat_` 开头的那串字符。

> 这串 Token 只会显示一次。它就像一把只能打开这一个仓库的钥匙，不要发到聊天群，也不要提交到仓库里的任何文件。

---

## 第 5 步：进入管理台，上传第一张照片

1. 打开你单独保存的管理页地址（不在网站导航中）；
2. 填入：
   - **GitHub 仓库**：`你的用户名/树屋仓库名`
   - **分支**：`main`
   - **GitHub Token**：粘贴上一步生成的 Token（Fine-grained 或 Classic 都可以）
   - 如果是自己的电脑，可以勾选“在这台设备记住配置”
3. 点击 **连接仓库**。连接成功后，上传面板会解锁，并显示当前已有的分组。
4. 选择分组，或者选择「＋ 新建一个分组」并输入分组名和一句描述。
5. 把照片拖进虚线框（或点击选择）。支持 JPG / PNG / WebP / AVIF，建议一次 1–20 张。
6. 给照片配动态预览：在上传列表里点「添加动态视频」选择自己的 MP4 / WebM；也可以和照片一起选中同名视频自动配对。视频不会被自动生成或重新编码。
7. 确认标题，点击 **发布到树屋**。
8. 上传成功后会出现 GitHub Pages 更新的提示。等约 1 分钟，刷新网站主页就能看到新照片。

### 当前内容

线上示例内容已经清空，网站目前是空相册。上传第一张照片并发布后，相册会自动出现内容。

---

## 第 6 步（可选）：用 Cloudflare Pages 加速

GitHub Pages 在中国大陆有时会慢。你可以让同一个仓库同时发布到 Cloudflare Pages，仍然免费，而且带宽额度更宽松。

1. 注册 <https://dash.cloudflare.com/>；
2. 左侧 **Workers & Pages → Create → Pages → Connect to Git**；
3. 授权 GitHub，选择你的树屋仓库；
4. 配置：
   - Project name：例如 `tree-book-house`
   - Production branch：`main`
   - Framework preset：**None**
   - Build command：留空
   - Build output directory：`/`
5. 点击 **Save and Deploy**；
6. 成功后得到 `https://tree-book-house.pages.dev/` 这样的网址。

管理台仍然提交到 GitHub，Cloudflare 会跟着自动更新。你可以在 Cloudflare 后台绑定自己的域名。

> Cloudflare Pages 免费版有每月构建次数和文件数量上限，但对个人照片站通常足够。若照片特别多（几千张以上）或需要更细的流量控制，之后可以考虑 Cloudflare R2，但这已经超出“完全零成本小白方案”的范围。

---

## 日常更新流程

之后每次加照片，不需要再碰代码：

1. 打开你保存的管理页地址；
2. 如果配置没有被记住，重新填仓库和 Token；
3. 选分组 / 新建分组；
4. 拖入图片；
5. 发布；
6. 等约 1 分钟。

网站不会因为你的电脑关机而消失，因为文件已经在 GitHub 上了。

---

## 常见问题

### 打开网站是 404

- 确认仓库根目录有 `index.html`；
- 确认 **Settings → Pages** 的 Branch 是 `main`、目录是 `/ (root)`；
- 刚开启 Pages 时等 2–5 分钟；
- 看仓库的 **Actions** 标签，是否显示部署成功；
- 确认网址用的是 `https://用户名.github.io/仓库名/`，末尾有 `/`。

### 管理台连接失败

| 提示 | 处理 |
| --- | --- |
| Token 无效或已过期 | 重新生成 Token |
| 没有 Contents 写入权限 | 编辑 Token 权限，把 Contents 改为 Read and write |
| 找不到仓库或分支 | 检查仓库名是不是 `用户名/仓库名`，分支是否为 `main` |
| 仓库里没有 data/gallery.json | 说明网站文件没有上传完整，回到第 2 步 |
| 网络连接失败 | 检查网络 / 代理，GitHub API 在国内有时需要代理 |

### 发布成功了，但网站没变化

GitHub Pages 重新构建需要时间，通常 30 秒–1 分钟；Cloudflare Pages 也类似。等一会儿，然后用 `Ctrl + F5` / 手机刷新。新照片的文件名是唯一的，不会受旧缓存影响。

### 视频在手机上不播放

- 动态视频是你自己上传的文件，网站不会转码。请优先使用 **MP4（H.264）**；WebM 在部分较老 Safari 上可能无法播放。
- 如果你的视频是 MOV/HEVC，先在手机或电脑上导出为 MP4 再上传。
- 单个视频建议小于 60MB，否则上传会变慢，也可能占用较多 GitHub 仓库空间。

### 一次可以传多少张？

- GitHub 仓库建议控制在 1GB 以内；每张照片约 0.3–3MB，几百张没问题；
- 管理台单次最多 30 张，建议一次 1–20 张；
- 单张原始照片限制 40MB。

### 分支被保护，发布失败

去仓库 **Settings → Branches**，确认 main 分支没有开启“禁止直接推送”的保护规则；或者把 Pages 设置为从另一个未保护的分支发布，并在管理台里填写那个分支。

### 如何备份？

- 原始照片：保留在本机 / 移动硬盘 / 你自己的云盘；
- 网站仓库：GitHub 仓库页面 `Code → Download ZIP`，定期下载一份；
- 不要把唯一的照片只放在网站上。

### 免费服务会永久吗？

只要账号和仓库正常存在，GitHub Pages 就持续提供服务；这正是不使用临时图床的原因。但它不是法律意义上的“永久保证”。请把原图留在自己手里，并保留仓库备份。

---

## 安全清单

- [ ] Token 只勾选当前仓库，Contents 只给 Read and write
- [ ] 不在公共电脑勾选“记住配置”
- [ ] 从不把 Token 写进代码、截图或聊天记录
- [ ] 怀疑泄露时立刻在 GitHub 撤销 Token
- [ ] 公开仓库只放愿意被访客下载的照片
- [ ] 定期备份原图和仓库

---

如果需要换域名：GitHub Pages 在 **Settings → Pages → Custom domain** 里填写；Cloudflare Pages 在项目 **Custom domains** 里添加。两种方式都可以继续用免费套餐。
