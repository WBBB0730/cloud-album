# Cloud Album

## 架构

项目使用 Next.js App Router 构建，后端业务入口优先使用 Server Action。PostgreSQL 保存账号、空间、文件夹、媒体、上传和删除状态等元数据；腾讯云 COS 私有 bucket 保存图片和视频文件。

数据库访问层使用 Drizzle ORM。数据库 schema 按领域拆分到 `src/db/schema/`，migration 使用 Drizzle Kit 生成 SQL 文件并提交仓库。复杂约束、部分唯一索引或 Drizzle schema 不易表达的结构使用自定义 SQL migration。

当前数据库文件：

- `src/db/client.ts`：PostgreSQL Pool 和 Drizzle 实例。
- `src/db/schema/auth.ts`：`users`、`account_invites`、`sessions`。
- `src/db/schema/spaces.ts`：`spaces`、`space_members`。
- `src/db/schema/albums.ts`：`folders`、`media`。
- `src/db/schema/uploads.ts`：`upload_sessions`。
- `src/db/schema/deletes.ts`：`delete_batches`。
- `src/db/migrations/0000_clear_malice.sql`：第一版初始 migration。

业务代码按功能模块放在 `src/features/` 下，每个模块按 `actions.ts`、`service.ts`、`queries.ts` 分层：

- `actions.ts` 是 Server Action 入口。
- `service.ts` 负责业务规则、权限校验和事务。
- `queries.ts` 封装数据库查询。

核心领域模块包括：

- `auth`：手机号密码登录、注册邀请、会话。
- `spaces`：空间创建、空间成员、空间列表入口。
- `albums`：一级相册、媒体列表、页内预览和多选操作。
- `uploads`：COS 直传签名、上传记录、分片上传状态。
- `trash`：按文件夹组织的回收站、恢复、永久删除。
- `admin`：全局管理员的账号邀请、账号禁用和删除记录管理。

通用服务：

- `src/features/auth/session.ts`：Cookie 会话创建、读取、销毁，`requireUser` 和 `requireAdmin`。
- `src/features/auth/bootstrap.ts`：按 `.env.local` 初始化或提升全局管理员账号。
- `src/lib/env.ts`：服务端环境变量读取。
- `src/lib/cos.ts`：COS object key、STS 临时上传凭证、服务端读取 COS 时使用的短期 GET 签名 URL。
- `src/lib/media-url.ts`：生成前端可见的稳定媒体读取 URL，支持原始媒体和缩略图变体。
- `src/lib/security.ts`：随机 token、会话 token hash、邀请 token HMAC hash、手机号规范化。

页面结构：

- `/login`：手机号密码登录。
- `/invite/[token]`：邀请注册。
- `/spaces`：空间入口，支持通过弹窗创建空间和退出登录。
- `/spaces/[spaceId]`：相册首页，支持卡片/列表视图、空间创建者修改空间名称、通过弹窗创建相册、进入成员管理、进入回收站。
- `/spaces/[spaceId]/members`：成员管理页，展示空间成员，通过手机号邀请已注册用户加入，支持创建者移除其他成员和非创建者退出当前空间。
- `/spaces/[spaceId]/upload`：选择上传文件夹。
- `/spaces/[spaceId]/albums/[folderId]`：相册媒体网格，支持空间创建者修改相册名称、类型筛选、页内预览、长按多选、拖动快速选择、批量复制到另一个相册、批量下载、批量删除和选择相册封面；预览页单项操作也可复制当前媒体到另一个相册；复制是元数据级逻辑复制，只新增目标相册中的 `media` 行并复用原 COS 对象，复制弹窗内可直接新建目标相册。
- `/spaces/[spaceId]/albums/[folderId]/upload`：COS 分片上传队列，显示总进度，最多 5 个文件并发上传。
- `/spaces/[spaceId]/trash`：回收站文件夹列表。
- `/spaces/[spaceId]/trash/[folderId]`：回收站文件夹媒体列表，支持多选批量恢复和批量永久删除。
- `/admin`：全局管理后台，按 tab 展示邀请、账号和永久删除记录。
- `/api/media/[mediaId]`：稳定原始媒体读取路由。路由读取当前 Cookie 会话，校验用户属于媒体所在空间且媒体未永久删除，再由服务端使用短期 COS 签名 URL 拉取对象并流式转发；原始媒体保留 Range 支持，用于预览、下载和视频播放。
- `/api/media/[mediaId]/preview`：稳定预览媒体读取路由。路由同样先做 Cookie 会话和空间权限校验，再使用数据万象 CI 运行时处理参数请求 COS：图片返回最大边 720 的 WebP 缩略图，视频返回 1 秒处 jpg 截图。该路由只流式转发 CI 结果，不在 Next 中使用 `sharp`、`arrayBuffer()` 或其它 CPU 压缩逻辑。

渲染模式：

- 页面不再在 Server Component 中读取数据库、cookie 或 COS 签名来渲染业务内容。
- 页面渲染客户端壳，业务数据进入浏览器后通过 `src/features/app/view-actions.ts` 中的 Server Action 获取。
- mutation 仍使用各模块原有 Server Action，例如登录、注册、创建空间、上传确认、删除、恢复等。
- 动态路由使用动态段 layout 的 `generateStaticParams()` 返回空数组，让未知路径在首次访问时生成静态客户端壳；`revalidate = false` 用于无限期缓存壳，不做定时再验证。
- `/invite/[token]` 在 `[token]` layout 处理动态段；`/spaces/[spaceId]` 及其普通子页在 `[spaceId]` layout 处理动态段；相册详情和回收站详情的 `[folderId]` 分别在对应动态段 layout 处理。
- 页面级 `page.tsx` 保持 Server Wrapper，只解析 `params` 并把参数传给相邻 client wrapper 或业务 client 组件；查询参数继续在 client wrapper 中通过 `useSearchParams()` 读取，避免把 `searchParams` 引入 Server Page。

空间是数据隔离单位。`folders`、`media`、`upload_sessions`、`delete_batches` 等业务表都必须关联 `space_id`。所有查询、上传签名、读取 URL、删除和恢复操作都必须先校验当前用户属于目标空间；全局管理员是应用级权限，不等同于空间内角色。

上传去重以同一空间、同一相册内的完整文件 SHA-256 为准。客户端在原有上传流程内静默计算内容 hash，并随创建上传意图提交给服务端；服务端只把未删除且状态为 `ready` 的同 hash 媒体视为重复，命中后不创建新 `media`、不创建 `upload_sessions`，也不签发 COS 上传凭证。数据库在 `media(space_id, folder_id, content_hash)` 上维护只覆盖 `ready` 媒体的普通部分索引，用于加速重复查询；历史数据允许保存重复 hash，避免老数据回填时跳过已存在的重复媒体。同一客户端同批次重复文件由上传页内存 hash 表在交互无感的情况下跳过。

相册间复制媒体不复制 COS 对象。`media.cos_key` 使用普通索引而不是唯一索引，允许多个媒体记录引用同一个 COS object；复制到目标相册时按目标相册内已有 `content_hash` 或同 `cos_key` 跳过重复项。由于 COS 对象可能被多个媒体记录共享，删除、永久删除和回收站操作都只能更新数据库状态，不能删除 COS 文件。

相册复制相关索引按目标相册查询路径维护：`media_album_content_hash_idx` 覆盖 `space_id, folder_id, content_hash`，`media_album_cos_key_idx` 覆盖 `space_id, folder_id, cos_key`，二者都只索引 `ready` 且未删除/未永久删除的媒体。全局 `media_cos_key_idx` 保留给后续对象引用统计或孤儿对象清理。

空间和相册重命名属于空间创建者权限。Server Action 只负责解析表单和返回结构化结果，具体权限判断和更新写入在 `spaces/service.ts`、`albums/service.ts` 中完成；全局管理员身份不额外授予空间内重命名权限。

删除使用逻辑删除。普通删除写入 `deleted_at`、`deleted_by` 和 `delete_batch_id`；永久删除写入 `permanently_deleted_at`、`permanently_deleted_by`，但不删除 COS 文件。删除文件夹时，文件夹和其中媒体共享同一个删除批次；恢复文件夹时恢复同批次媒体。

文件夹封面使用 `folders.cover_media_id` 保存手动选择的媒体。空间文件夹列表优先读取该媒体作为封面；如果封面媒体已删除、永久删除或不可用，则回退到文件夹内最新可用媒体。

回收站保持和普通相册一致的一级文件夹结构。回收站首页按文件夹展示，不直接混排所有已删除媒体；进入回收站文件夹后展示该文件夹下已删除的图片和视频。回收站文件夹内的媒体使用选择态批量操作，支持批量恢复和批量永久删除。

详细技术设计见 `docs/TECHNICAL_DESIGN.md`。

## UI 导航补充

移动端头部操作统一由 `TopBar` 渲染，视觉对齐规则在 `src/styles/global.css` 的 `.ca-topbar`、`.ca-icon-btn` 中维护，并同步到 `docs/design/index.html`。空间列表右上角提供管理后台、新建空间和退出登录入口；空间详情右上角提供修改空间名称、成员管理、新建相册、回收站入口；相册详情右上角提供修改相册名称和上传入口；返回按钮在子页面头部左侧提供返回上级页面通路。新建空间和新建相册入口打开页内弹窗，不进入独立页面，默认名称分别为“我的空间”和“我的相册”。

危险确认弹窗和普通输入弹窗保持同一套卡片风格。确认弹窗统一使用 `ca-confirm-footer` 两列布局，取消按钮在左，危险操作按钮在右；危险操作按钮使用 `ca-confirm-button ca-danger-confirm-button`，取消按钮使用 `ca-confirm-button`。危险确认按钮样式在 `src/styles/global.css` 中集中维护，避免在各页面用临时 Tailwind 背景色导致默认按钮样式覆盖。

空态和媒体占位样式在 `src/styles/global.css` 中集中维护。`src/components/app/empty-state.tsx` 使用 `.ca-empty-state` 和 `.ca-empty-state-detail`；媒体缩略图和安全图片组件使用 `.ca-media-placeholder` 作为懒加载、加载失败和过期 URL 的灰色占位。

空间详情页的卡片/列表视图切换是本地 UI 偏好，不使用查询参数。`SpaceClient` 在页面内维护视图状态，并通过 `localStorage` 记住用户上次选择；切换按钮不触发路由导航。

相册详情页的类型筛选和拍摄时间排序也不使用查询参数。类型筛选是临时页面状态，默认显示全部；排序是用户偏好，通过 `localStorage` 记住。筛选栏和选择工具栏共用同一个固定高度操作区，选择态只替换内容，不额外插入新行。登录、邀请注册、管理后台邀请等表单直接在客户端事件中调用 Server Action，并通过结构化结果更新页面状态或跳转，不用 URL 查询参数承载错误或一次性结果。

有明确上级的应用内页面使用 `src/hooks/use-fixed-back-navigation.ts` 固定物理返回和浏览器返回的目标，避免按真实访问历史跳到错误层级。根布局中的 `src/components/app/app-history-recorder.tsx` 只维护当前标签页的内存历史，不写入 `sessionStorage`，也不做路由目标猜测；固定返回 hook 通过同 URL 的 history guard 接管浏览器物理返回，guard state 记录当前 URL 和固定目标 URL。如果目标 URL 已在当前标签页历史中，hook 使用浏览器真实 `history.go(delta)` 回到最近的目标条目，页面内返回按钮和物理返回都走同一条真实历史链，避免用 `router.replace()` 造出重复条目或留下中间页面残影；否则才替换到固定上级。多选、上传离开保护等阻塞态拦截物理返回时会恢复刚被弹出的 guard 条目并执行业务回调，不新建 guard，避免裁剪已有真实历史。相册预览打开时暂停页面固定返回，上传页存在等待或上传中文件时先确认再离开。

重要数据页的内部滚动区域使用 `src/components/app/pull-to-refresh.tsx` 提供下拉刷新，刷新动作复用当前页面 `useServerAction().refresh()`。相册详情和回收站相册这类复杂手势页需要在预览、多选等状态下禁用下拉刷新，避免和缩放、左右滑动、长按多选或拖动快速选择冲突。

`src/hooks/use-server-action.ts` 支持页面传入可选合并策略。默认页面仍使用 fresh 数据整份替换；图片密集页面可以通过 `mergeData` 做结构共享，减少缓存数据和 fresh 数据切换时的重渲染，并通过 `getCacheData` 保证本地缓存仍写入最新服务端数据。相册详情页使用该能力保留未变化媒体对象引用；媒体内容 URL 由 `src/lib/media-url.ts` 按媒体 id 生成稳定应用内路径。列表数据同时提供 `url` 和 `thumbnailUrl`：`url` 用于预览、下载等原始媒体场景，`thumbnailUrl` 指向 `/api/media/[mediaId]/preview`，用于相册网格、封面和预览底部缩略图，避免相册页直接拉取原图。

全局 toast 使用 `react-hot-toast`，入口为 `src/components/app/app-toaster.tsx`，在根布局中挂载到底部居中位置，并通过 `env(safe-area-inset-bottom)` 避开移动端底部安全区；toast 容器层级高于全局 loading，避免操作成功提示被遮挡。`sonner` 依赖和 shadcn 生成的 `src/components/ui/sonner.tsx` 保留在项目中，当前不作为全局 toast 入口。
