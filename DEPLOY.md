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

## 本地检查

运行 `hugo --minify`。验证 GitHub Pages 路径时可运行 `hugo --minify --baseURL https://kie70.github.io/myblog/ --destination <临时目录>`。正常部署只需要 Hugo，字体维护脚本不是构建依赖。
