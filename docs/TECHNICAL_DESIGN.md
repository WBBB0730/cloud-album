# 云相册技术设计

## 技术栈

- Web 框架：Next.js。
- 后端入口：Server Action。
- 数据库：PostgreSQL。
- ORM：Drizzle ORM。
- Migration：Drizzle Kit 生成 SQL migration，migration 文件提交到仓库。
- 文件存储：腾讯云 COS 私有 bucket。

## ORM 选择

第一版使用 Drizzle ORM。

选择原因：

- 项目依赖 PostgreSQL 的约束、索引和事务语义。
- 空间隔离、逻辑删除、删除批次恢复、上传状态管理都需要清晰的 SQL 边界。
- Drizzle 更贴近 SQL，便于表达复杂查询、事务和自定义 migration。
- ORM 负责类型安全和查询组织，不决定业务模型。

不采用 Prisma 作为第一选择，原因是本项目更需要直接掌控 SQL migration、部分唯一索引、复合索引和复杂事务。

## 数据库目录组织

```text
src/db/
  client.ts
  schema/
    auth.ts
    spaces.ts
    albums.ts
    uploads.ts
    deletes.ts
    index.ts
  migrations/
```

职责：

- `client.ts`：数据库连接和 Drizzle 实例。
- `schema/auth.ts`：`users`、`account_invites`、`sessions`。
- `schema/spaces.ts`：`spaces`、`space_members`。
- `schema/albums.ts`：`folders`、`media`。
- `schema/uploads.ts`：`upload_sessions`。
- `schema/deletes.ts`：`delete_batches`。
- `schema/index.ts`：统一导出 schema。
- `migrations/`：Drizzle Kit 生成的 SQL migration。

## 业务目录组织

```text
src/features/
  auth/
    actions.ts
    service.ts
    queries.ts
  spaces/
    actions.ts
    service.ts
    queries.ts
  albums/
    actions.ts
    service.ts
    queries.ts
  uploads/
    actions.ts
    service.ts
    queries.ts
  trash/
    actions.ts
    service.ts
    queries.ts
  admin/
    actions.ts
    service.ts
    queries.ts
```

分层规则：

- `actions.ts`：Server Action 入口，负责表单解析、当前用户获取、调用 service、触发 revalidate。
- `service.ts`：业务事务、权限判断、跨表写入、状态流转。
- `queries.ts`：数据库查询和小范围写入封装。

Server Action 不直接散写数据库操作。涉及空间校验、上传确认、删除恢复的逻辑必须进入 service 层。

## 核心数据表

第一版核心表：

- `users`
- `account_invites`
- `sessions`
- `spaces`
- `space_members`
- `folders`
- `media`
- `upload_sessions`
- `delete_batches`

## 关键约束

- `users.phone` 唯一。
- `space_members(space_id, user_id)` 唯一。
- `folders.space_id` 必填。
- `media.space_id` 必填。
- `media.folder_id` 必须归属同一个 `space_id`。
- 同一手机号不能同时存在多个未处理注册邀请。
- 普通列表默认过滤 `deleted_at is null` 和 `permanently_deleted_at is null`。
- 回收站首页按文件夹展示，不直接混排所有已删除媒体。
- 删除批次使用 `delete_batches` 记录批次元信息，`folders` 和 `media` 通过 `delete_batch_id` 关联。

## 索引方向

建议索引：

- `media(space_id, folder_id, taken_at desc)`：文件夹媒体列表。
- `media(space_id, deleted_at)`：回收站查询。
- `media(space_id, permanently_deleted_at)`：永久删除过滤。
- `folders(space_id, deleted_at)`：空间文件夹和回收站文件夹查询。
- `space_members(user_id, space_id)`：用户空间列表。
- `account_invites(phone)`：邀请查重。

部分唯一索引、复杂约束如果 Drizzle schema 表达不顺，使用自定义 SQL migration。

## Migration 规则

- 使用 Drizzle Kit 从 schema 生成 SQL migration。
- migration 文件必须提交到仓库。
- 生产环境只运行 migration。
- 不使用直接推送 schema 到生产库的方式替代 migration。

## 事务边界

必须使用事务的场景：

- 接受注册邀请并创建用户。
- 创建空间并加入创建者为成员。
- 创建上传记录和媒体草稿。
- 上传完成确认并更新媒体状态。
- 删除文件夹并联动删除文件夹内媒体。
- 恢复文件夹并恢复同一删除批次媒体。
- 永久删除状态写入。

## 空间隔离

所有业务查询和写入必须带 `space_id`。

签发 COS 上传授权、签发媒体读取 URL、删除、恢复、永久删除前，必须校验当前用户属于目标空间。

全局管理员能力是应用级权限，不等同于空间成员权限。
