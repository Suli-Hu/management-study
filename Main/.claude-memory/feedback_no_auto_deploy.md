---
name: 禁止自动部署
description: 每次部署前必须征得用户同意，不能擅自部署
type: feedback
originSessionId: e04ea1b9-3ecf-4a0d-8297-0c8b3b7b9d0b
---
禁止擅自执行部署命令，每次部署前必须明确询问用户是否可以部署。

**部署命令（已迁移到 Cloudflare Pages）：**
```
wrangler pages deploy Main/ --project-name management-study --branch main --commit-dirty=true
```

**旧命令（Netlify，已弃用）：**
```
netlify deploy --prod --dir=Main
```

**Why:** 用户明确要求，希望在部署前有确认环节，避免未经同意就上线。

**How to apply:** push 到 GitHub 可以直接做，但部署必须先问用户确认。
