# 部署说明

仓库：https://github.com/Kie70/myblog

## GitHub Pages

正式地址：https://kie70.github.io/myblog/

仓库 Pages 的构建来源为 GitHub Actions。推送到 `main` 后，`.github/workflows/pages.yml` 自动下载 Hugo Extended 0.158.0，递归检出 PaperMod 子模块，构建并发布 `public`。也可以在 Actions 中手动运行。

构建地址来自 `configure-pages`，包含 `/myblog/` 前缀。模板资源、Markdown 图片、本地字体和首页预取地址均使用这个前缀。文章源文件不需要为不同平台复制或改写。

## Vercel

正式地址：https://myblog-snowy-three.vercel.app/

现有 Vercel 项目 `kie70s-projects/myblog` 已连接本仓库。推送 `main` 会自动生产部署，预览分支使用各自预览地址。

`vercel.json` 使用 `bash build.sh` 构建并输出 `public`，Hugo 版本固定为 0.158.0。生产环境优先使用 `VERCEL_PROJECT_PRODUCTION_URL`，预览环境使用 `VERCEL_URL`。仅 Vercel 构建启用其 Analytics 脚本。本地字体文件使用内容哈希文件名及一年缓存。

分享上面的正式地址即可；带随机字符串的单次部署地址不会跟随之后的推送更新。

## 原有 Cloudflare Pages

兼容原有配置：构建命令 `bash build.sh`，输出目录 `public`，根目录留空。使用 `CF_PAGES_URL` 作为该次构建地址。

## 《填塞物》作品

首页精选项目与项目页均从 `data/projects.yaml` 读取，按列表顺序展示。《填塞物》位于第一项，链接至站内 `/experiments/the-filling/`，兼容 GitHub Pages 的 `/myblog/` 前缀。

完整作品以静态构建产物保存在 `static/experiments/the-filling/`。源码仓库为 https://github.com/Kie70/the-filling ，当前同步版本为 `d9b5733fd019b70741c5a3919840d4078c44a3fb`。更新作品时，在源码仓库运行 `npm ci` 和 `npm run build -- --base=./`，再将 `dist/` 内容同步到此目录；只推送作品源码仓库不会更新博客内的副本。

项目封面来自 `exports/filling-88-95-cycle.mp4`，即页面滚动进度 88–95 / 100 的往返片段，提取为 `static/images/the-filling/frame-01.webp` 至 `frame-24.webp`（640 × 360）。`assets/js/project-scroll.js` 将每 280px 页面滚动映射到一次循环，停止滚动即定格；接近视口时加载帧，减少动态效果模式保留静态封面。

这些静态文件随本仓库的 GitHub Pages 与 Vercel 自动部署发布，无需其他托管服务。

## 本地构建验证

运行 `hugo --minify`。验证 GitHub Pages 路径时可运行 `hugo --minify --baseURL https://kie70.github.io/myblog/ --destination <临时目录>`。正常部署只需要 Hugo，字体维护脚本不是构建依赖。
