# 项目记忆

## 长期约定

- 项目回答和仓库说明均使用中文。
- 设计稿位于 `docs/design/index.html`；命令行读取中文偶尔会显示乱码，应优先按文件实际 UTF-8 内容和浏览器渲染结果判断。
- 第一版技术栈：Next.js App Router、Server Action、PostgreSQL、Drizzle ORM、腾讯云 COS。
- 页面业务数据已改为客户端进入后通过 `src/features/app/view-actions.ts` 调用 Server Action 拉取；写操作仍使用各模块原有 Server Action。
- 全局 loading 由 `src/components/app/global-loading.tsx` 提供；内部链接和表单提交会自动触发，长上传流程需要调用 `useGlobalLoading()` 并用 `try/finally` 关闭。
- 视口高度是硬性约束：页面、弹层、抽屉、加载态、设计稿禁止使用 `vh`/`svh`/`h-screen`/`min-h-screen`，统一使用 `dvh`；App 外框使用 `height: 100dvh`，滚动放在内部容器。

## 产品决策

- 产品核心概念是“空间”；用户可创建空间，也可加入多个空间。
- 登录后默认进入空间列表，不记录或默认打开上次访问空间。
- 第一版空间内成员同权；全局管理员是应用级权限，不等同于空间角色。
- 不开放自由注册；注册只能通过全局管理员创建的手机号邀请链接完成，邀请可撤销。
- 注册邀请只由管理员填写手机号；用户昵称由被邀请用户在注册页自行填写。
- 第一版只做一级文件夹，不做搜索。
- 上传支持图片和视频、多文件、大文件/视频分片、失败重试和续传。
- 媒体默认按拍摄时间排序；图片 EXIF 或视频元数据读取失败时使用上传时间。
- 普通删除和永久删除都只做逻辑删除，不删除 COS 文件；文件夹恢复时恢复同一删除批次下的媒体。
- 回收站保持一级文件夹结构：回收站首页按文件夹展示，进入文件夹后展示其中已删除媒体。
- 全局管理后台按邀请、账号、空间、删除记录分区展示，不混在同一个列表。
- 相册详情一次加载全部媒体，图片/视频/全部筛选和拍摄时间排序在客户端基于已加载数据完成，不为筛选切换重新请求服务端。

## 架构约定

- 数据库 schema 按 `src/db/schema/` 领域拆分。
- 业务代码按 `src/features/*/{actions,service,queries}.ts` 分层。
- 删除批次使用 `delete_batches` 表，文件夹和媒体通过 `delete_batch_id` 关联。
- COS 浏览器直传使用 COS JS SDK；服务端通过 `qcloud-cos-sts` 下发临时上传凭证。
- COS 分片上传临时凭证使用腾讯云 STS SDK 同款 resource：`qcs::cos:{region}:uid/{appid}:prefix//{appid}/{shortBucketName}/{cosKey}`，并且动作必须包含 `name/cos:ListMultipartUploads`；`cos-js-sdk-v5` 的 `sliceUploadFile` 开始上传前会固定请求 `GET /?uploads&prefix={Key}`。
- COS object key 不能带前导 `/`；否则 STS policy 会按 `/space/...` 授权，但 `cos-js-sdk-v5` 请求 `?uploads&prefix=space/...` 时会去掉前导 `/`，导致 403。
- 私有媒体读取通过 `src/lib/cos.ts` 生成短期 COS GET 签名 URL。
- 媒体预览是相册页内 overlay 行为，不使用独立预览路由；图片预览缩放使用 `react-zoom-pan-pinch`，桌面双击和移动端双击触摸都固定放大到 2.5 倍并按点击位置定位。
- 媒体预览上下 UI 是半透明浮层，不占用图片布局空间；单击媒体区域显示/隐藏，显示后 5 秒自动隐藏。
- 预览 overlay 打开时会压入一层浏览器 history；手机返回键和预览返回按钮都应关闭预览，不离开相册页。
- 媒体预览打开后使用当次打开瞬间的媒体列表快照；后台刷新相册数据时不替换预览中的签名 URL，避免同一图片因 URL 更新而闪烁。
- 相册列表刷新数据时，同一媒体 id 优先复用当前页面已有签名 URL；新媒体才使用新 URL，避免从本地缓存切到新数据时缩略图闪烁。
- COS 签名 URL 会主动解析 `q-sign-time`，过期或 60 秒内即将过期时不再复用；先显示灰色占位，等服务端新 URL 到达后替换，加载失败也用灰色占位兜底，避免裂图。
- `useServerAction` 暴露手动 `refresh()`；相册详情不做固定轮询，而是根据当前媒体签名 URL 的最近过期时间设置一次性 timer，提前 60 秒刷新。相册页 focus 或从后台切回前台时会检查 URL 是否即将过期，并用 10 秒防抖避免重复请求。相关 timer 和事件监听必须在依赖变化或卸载时清理。
- 相册页收到同一图片的新签名 URL 时，如果旧 URL 仍可用，会继续显示旧 URL，并以 3 并发后台预加载新 URL；预加载成功后再替换当前页面 URL。视频暂不做这种预加载。
- PWA 只保留基础浏览器配置：`public/manifest.webmanifest` 使用 `display: "standalone"`，根布局声明 manifest、图标和 Apple Web App metadata；不注册 service worker，不做自定义安装弹窗或 Fullscreen API。
