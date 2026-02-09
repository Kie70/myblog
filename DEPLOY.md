# 部署说明 (Deploy)

## Cloudflare Pages

在 Cloudflare Pages 项目 **Settings → Builds & deployments → Build configuration** 中设置：

- **Build command**: `bash build.sh`
- **Build output directory**: `public`
- **Root directory**: 留空（仓库根目录）

保存后触发一次 **Retry deployment** 或重新推送代码，即可用当前站点地址作为 baseURL 正确构建（头像、链接、资源会正常显示）。

## Vercel

已通过 `vercel.json` 配置，无需修改。构建时会自动使用 `VERCEL_URL` 作为 baseURL。
