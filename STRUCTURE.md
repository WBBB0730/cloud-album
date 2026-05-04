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
- `src/lib/cos.ts`：COS object key、STS 临时上传凭证、短期读取签名 URL。
- `src/lib/security.ts`：随机 token、会话 token hash、邀请 token HMAC hash、手机号规范化。

页面结构：

- `/login`：手机号密码登录。
- `/invite/[token]`：邀请注册。
- `/spaces`：空间入口。
- `/spaces/[spaceId]`：相册首页，支持卡片/列表视图、创建相册、进入成员管理、进入回收站。
- `/spaces/[spaceId]/members`：成员管理页，展示空间成员，通过手机号邀请已注册用户加入，支持创建者移除其他成员和非创建者退出当前空间。
- `/spaces/[spaceId]/upload`：选择上传文件夹。
- `/spaces/[spaceId]/albums/[folderId]`：相册媒体网格，支持类型筛选、页内预览、长按多选、拖动快速选择、批量下载、批量删除和选择相册封面。
- `/spaces/[spaceId]/albums/[folderId]/upload`：COS 分片上传队列，显示总进度，最多 5 个文件并发上传。
- `/spaces/[spaceId]/trash`：回收站文件夹列表。
- `/spaces/[spaceId]/trash/[folderId]`：回收站文件夹媒体列表。
- `/admin`：全局管理后台，按 tab 展示邀请、账号和永久删除记录。

渲染模式：

- 页面不再在 Server Component 中读取数据库、cookie 或 COS 签名来渲染业务内容。
- 页面渲染客户端壳，业务数据进入浏览器后通过 `src/features/app/view-actions.ts` 中的 Server Action 获取。
- mutation 仍使用各模块原有 Server Action，例如登录、注册、创建空间、上传确认、删除、恢复等。
- 动态路由使用动态段 layout 的 `generateStaticParams()` 返回空数组，让未知路径在首次访问时生成静态客户端壳；`revalidate = false` 用于无限期缓存壳，不做定时再验证。
- `/invite/[token]` 在 `[token]` layout 处理动态段；`/spaces/[spaceId]` 及其普通子页在 `[spaceId]` layout 处理动态段；相册详情和回收站详情的 `[folderId]` 分别在对应动态段 layout 处理。
- 页面级 `page.tsx` 保持 Server Wrapper，只解析 `params` 并把参数传给相邻 client wrapper 或业务 client 组件；查询参数继续在 client wrapper 中通过 `useSearchParams()` 读取，避免把 `searchParams` 引入 Server Page。

空间是数据隔离单位。`folders`、`media`、`upload_sessions`、`delete_batches` 等业务表都必须关联 `space_id`。所有查询、上传签名、读取 URL、删除和恢复操作都必须先校验当前用户属于目标空间；全局管理员是应用级权限，不等同于空间内角色。

删除使用逻辑删除。普通删除写入 `deleted_at`、`deleted_by` 和 `delete_batch_id`；永久删除写入 `permanently_deleted_at`、`permanently_deleted_by`，但不删除 COS 文件。删除文件夹时，文件夹和其中媒体共享同一个删除批次；恢复文件夹时恢复同批次媒体。

文件夹封面使用 `folders.cover_media_id` 保存手动选择的媒体。空间文件夹列表优先读取该媒体作为封面；如果封面媒体已删除、永久删除或不可用，则回退到文件夹内最新可用媒体。

回收站保持和普通相册一致的一级文件夹结构。回收站首页按文件夹展示，不直接混排所有已删除媒体；进入回收站文件夹后展示该文件夹下已删除的图片和视频。

详细技术设计见 `docs/TECHNICAL_DESIGN.md`。

## UI 导航补充

移动端头部操作统一由 `TopBar` 渲染，视觉对齐规则在 `src/styles/global.css` 的 `.ca-topbar`、`.ca-icon-btn` 中维护，并同步到 `docs/design/index.html`。空间列表右上角提供管理后台入口，空间详情右上角提供上传、新建文件夹、回收站入口；返回按钮在子页面头部左侧提供返回上级页面通路。

有明确上级的应用内页面使用 `src/hooks/use-fixed-back-navigation.ts` 固定物理返回和浏览器返回的目标，避免按真实访问历史跳到错误层级。相册预览打开时暂停页面固定返回，上传页存在等待或上传中文件时先确认再离开。
