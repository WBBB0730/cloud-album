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
- `albums`：一级文件夹、媒体列表、预览。
- `uploads`：COS 直传签名、上传记录、分片上传状态。
- `trash`：按文件夹组织的回收站、恢复、永久删除。
- `admin`：全局管理员的账号邀请、账号、空间和删除记录管理。

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
- `/spaces/[spaceId]`：文件夹首页，支持卡片/列表视图、创建文件夹、添加成员、进入回收站。
- `/spaces/[spaceId]/upload`：选择上传文件夹。
- `/spaces/[spaceId]/folders/[folderId]`：文件夹媒体网格，支持类型筛选和删除媒体。
- `/spaces/[spaceId]/folders/[folderId]/upload`：COS 分片上传队列。
- `/spaces/[spaceId]/folders/[folderId]/media/[mediaId]`：沉浸式图片/视频预览。
- `/spaces/[spaceId]/trash`：回收站文件夹列表。
- `/spaces/[spaceId]/trash/[folderId]`：回收站文件夹媒体列表。
- `/admin`：全局管理后台，按 tab 展示邀请、账号、空间、永久删除记录。

渲染模式：

- 页面不再在 Server Component 中读取数据库、cookie 或 COS 签名来渲染业务内容。
- 页面渲染客户端壳，业务数据进入浏览器后通过 `src/features/app/view-actions.ts` 中的 Server Action 获取。
- mutation 仍使用各模块原有 Server Action，例如登录、注册、创建空间、上传确认、删除、恢复等。
- 动态路由在 Next 构建输出中仍可能显示为按需路由壳，但业务数据不做 SSR。

空间是数据隔离单位。`folders`、`media`、`upload_sessions`、`delete_batches` 等业务表都必须关联 `space_id`。所有查询、上传签名、读取 URL、删除和恢复操作都必须先校验当前用户属于目标空间；全局管理员是应用级权限，不等同于空间内角色。

删除使用逻辑删除。普通删除写入 `deleted_at`、`deleted_by` 和 `delete_batch_id`；永久删除写入 `permanently_deleted_at`、`permanently_deleted_by`，但不删除 COS 文件。删除文件夹时，文件夹和其中媒体共享同一个删除批次；恢复文件夹时恢复同批次媒体。

回收站保持和普通相册一致的一级文件夹结构。回收站首页按文件夹展示，不直接混排所有已删除媒体；进入回收站文件夹后展示该文件夹下已删除的图片和视频。

详细技术设计见 `docs/TECHNICAL_DESIGN.md`。

## UI 导航补充

移动端头部操作统一由 `TopBar` 渲染，视觉对齐规则在 `src/styles/global.css` 的 `.ca-topbar`、`.ca-icon-btn` 中维护，并同步到 `docs/design/index.html`。空间列表右上角提供管理后台入口，空间详情右上角提供上传、新建文件夹、回收站入口；返回按钮在子页面头部左侧提供返回上级页面通路。
