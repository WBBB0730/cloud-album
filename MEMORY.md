# 项目记忆

## 长期约定

- 项目回答和仓库说明均使用中文。
- 如果文件内容和我上一次修改后不一样，大概率是用户手动修改；必须优先尊重，不能擅自覆盖、回退或“统一”掉。
- `PLAN.md` 使用 TODO/checklist 形式，只保留当前待办、风险和验证重点；历史执行记录如需保留，归档到 `docs/AGENTS_LOG.md`。
- 设计稿位于 `docs/design/index.html`；命令行读取中文偶尔会显示乱码，应以文件实际 UTF-8 内容和浏览器渲染结果为准。
- 视口高度是硬性约束：页面、弹层、抽屉、加载态、设计稿禁止使用 `vh` / `svh` / `h-screen` / `min-h-screen`，统一使用 `dvh`；App 外框使用 `height: 100dvh`，滚动放在内部容器。
- 标题字号整体克制：顶栏主标题约 18px；异步加载实体名称的顶栏标题用 `Skeleton` 占位，不显示“空间”“相册”等兜底文案。

## 产品决策

- 产品名为“拾云”，描述为“一个轻量的云相册”。
- 产品核心概念是“空间”；用户可创建空间，也可加入多个空间。
- 登录后默认进入空间列表，不记住或默认打开上次访问空间。
- 第一版空间内成员同权；全局管理员是应用级权限，不等同于空间内权限。
- 对外只展示空间语义：创建者或成员；不要在成员页或账号列表展示“全局管理员/普通用户”身份标签。
- 不开放自由注册；注册只能通过全局管理员创建的手机号邀请链接完成。邀请可撤销；待注册邀请需要展示可复制链接，校验仍使用 token hash，`token_hash` 不下发客户端。
- 注册邀请只由管理员填写手机号；用户昵称由被邀请用户注册时填写。
- 管理后台账号操作是禁用账号，不物理删除用户；管理员不能禁用当前登录账号。
- 第一版只做一级相册，不做搜索。
- 上传支持图片和视频、多文件、大文件/视频分片、失败重试和续传。
- 媒体默认按拍摄时间排序；图片 EXIF 或视频元数据读取失败时使用上传时间。
- 普通删除和永久删除都只做逻辑删除，不删除 COS 文件；文件夹恢复时恢复同一删除批次下的媒体。
- 回收站保持一级相册结构：先展示相册，进入后展示其中已删除媒体。
- 全局管理后台按邀请、账号、空间、删除记录分区展示，不混在同一个列表。
- 相册详情一次加载全部媒体；图片/视频/全部筛选和拍摄时间排序在客户端完成，不为筛选切换重新请求服务端。
- 相册封面可从相册内媒体设置；手动封面不可用时回退到最新可用媒体。

## 架构约定

- 技术栈：Next.js App Router、Server Action、PostgreSQL、Drizzle ORM、腾讯云 COS。
- 根目录 `.env.example` 按 `.env.local` 的键顺序、注释和空行格式维护脱敏示例；新增或删除 `src/lib/env.ts` 中的变量时需要同步更新。
- 数据库 schema 按 `src/db/schema/` 拆分；业务代码按 `src/features/*/{actions,service,queries}.ts` 分层。
- 页面业务数据通过 `src/features/app/view-actions.ts` 在客户端拉取；写操作仍使用各模块 Server Action。
- 私有媒体前端读取使用 `src/lib/media-url.ts` 生成稳定应用内 URL：原图/原视频为 `/api/media/[mediaId]`，缩略图/视频封面为 `/api/media/[mediaId]/preview`；路由校验 Cookie 会话、空间成员和媒体未永久删除后，服务端再用 `src/lib/cos.ts` 生成短期 COS GET 签名 URL 拉取对象或 CI 处理结果。
- COS 浏览器直传使用 COS JS SDK；服务端通过 `qcloud-cos-sts` 下发临时上传凭证。
- COS object key 不能带前导 `/`；否则 STS policy 和 `cos-js-sdk-v5` 的 `?uploads&prefix=` 行为不一致，会导致 403。
- COS 分片上传临时凭证 resource 使用腾讯云 STS SDK 同款格式，并且动作必须包含 `name/cos:ListMultipartUploads`。
- 删除批次使用 `delete_batches` 表，文件夹和媒体通过 `delete_batch_id` 关联。
- 媒体删除只改数据库，不访问 COS；批量删除必须使用单条批量更新并校验数量，避免逐条查询/逐条更新。
- 删除媒体时如果包含当前封面，必须在同一事务内更新 `folders.cover_media_id` 为剩余最新可用媒体；无剩余媒体时清空。
- 上传页使用单一队列调度器，文件维度最多 5 并发；成功项隐藏但保留在总进度统计中；组件卸载或离开时要清理本地资源和未完成回写。
- 上传页会在原有“上传中”状态内静默计算完整文件 SHA-256，并把 `contentHash` 传给创建上传意图；同一空间/相册内已有 ready 媒体命中相同 hash 时，服务端直接返回重复结果，不创建新媒体、不签 COS 上传凭证。数据库对 `content_hash` 使用普通部分索引，不做唯一约束，历史数据允许重复 hash 以便完整回填。
- 历史媒体 hash 统计使用 `pnpm media:hash`，脚本路径为 `scripts/media-hash.ts`，通过 `tsx` 执行；回填写入使用 `pnpm media:hash:backfill`，会更新 `media.content_hash` 和对应 `upload_sessions.content_hash`。
- 上传页存在等待或上传中文件时需要离开保护：页面内返回、自带返回、刷新/关闭都要处理，且确认离开前先关闭本地 guard，避免重复拦截。
- 全局 loading 由 `src/components/app/global-loading.tsx` 提供；长流程需要调用 `useGlobalLoading()` 并用 `try/finally` 关闭。
- 动态路由壳使用 layout 级 `generateStaticParams() { return [] }` 和 `revalidate = false`；查询参数不要传入 Server Page，放在 client wrapper 中读取。
- 有明确上级的应用内页面使用固定返回目标，不依赖浏览器真实访问历史；预览、多选、上传离开保护要优先处理自身状态。
- 重要数据页下拉刷新统一使用 `PullToRefresh`；复杂手势页在预览、多选等状态下必须禁用下拉刷新。
- `useServerAction` 支持可选 `mergeData` / `getCacheData`；相册详情用结构共享减少刷新重渲染，但本地缓存仍应写入服务端 fresh 数据。
- `useServerAction` 的 `localStorage` 页面数据缓存不能只按 loader/deps 复用；服务端返回字段契约变化时必须加版本、迁移或运行时校验，否则旧缓存会先于 fresh 数据进入组件渲染。当前页面缓存 key 保持稳定，value 使用 `{ version, savedAt, data }` 包装；读取前会清理旧裸缓存和旧 key 版本缓存。
- 管理后台用户列表只允许返回页面展示需要的账号字段，不能下发 `passwordHash` 等敏感字段。

## 媒体和缓存

- 前端可见媒体 URL 必须保持稳定，使用 `/api/media/[mediaId]`，不要重新把 COS 预签名 URL 下发给浏览器；COS 短签名只作为服务端代理到 COS 的内部实现。
- 列表数据同时提供 `url` 和 `thumbnailUrl`：相册网格、封面和预览底部缩略条用 `thumbnailUrl`，沉浸式预览、下载和视频播放用 `url`；不要让相册页直接显示原图。
- 稳定媒体读取路由统一使用协商缓存，返回 `Cache-Control: private, no-cache`、`ETag` 和 `Last-Modified`。浏览器可以保存内容，但每次复用前都要重新验证；服务端在权限有效且版本未变时返回 304。原始媒体路由转发 Range 请求以保留视频播放能力；`/preview` 路由使用数据万象 CI 运行时生成图片缩略图和视频封面，只流式转发，不在 Next 进程内使用 `sharp` 或 `arrayBuffer()` 压缩。
- 数据万象图片下载时处理的私有读 URL 不要把 `imageMogr2/...` 处理参数放进 `Query` 参与签名；实测会触发 COS `SignatureDoesNotMatch`。当前使用官方 `cos.getObjectUrl({ Sign: true, QueryString })`：签名只覆盖原始对象，处理参数作为未签名 query 追加，图片 preview 可真实返回 200。
- 视频封面 `ci-process=snapshot` 如果返回 `FunctionNotEnabled`，说明当前存储桶的数据万象媒体处理服务未激活或未绑定生效，不是 URL 签名问题；可用 CI `GET /mediabucket` 查询媒体处理 bucket 列表。`cloud-album-1314488277` 开通媒体处理后，视频 `/preview` 已实测返回 `200 image/jpeg`。
- 需要 Cookie 鉴权的私有图片不能走 Next Image 默认优化取源链路；`MediaThumbnail` 和 `SafeImage` 使用 `unoptimized`，让浏览器直接请求稳定媒体 URL 并复用自身 HTTP 缓存。
- 相册媒体缩略图使用 `IntersectionObserver` 懒加载；未进入加载范围前只显示灰色占位，不挂载真实图片或视频。
- 空态和媒体占位样式集中在全局 CSS：页面空态使用 `EmptyState`；图片/视频懒加载、加载失败、过期 URL 占位使用 `.ca-media-placeholder`。
- 媒体预览是相册页内 overlay 行为，不使用独立预览路由；打开时使用当次媒体列表快照，后台刷新不替换预览中的媒体 URL。
- 预览图片使用原图；不要恢复“先显示 Next 优化图，稳定后切 COS 原图”的方案。
- 预览主区域只能挂载当前项和前后 2 项的原图/原视频，其它项使用等宽占位，避免一打开预览就加载整本相册原图。
- 预览主区域会同时挂载当前项和邻近原图；当前图片需要用较高加载优先级，邻近预挂载图片用较低优先级，避免邻近原图和当前高清大图抢带宽。
- 预览图片加载完成后一帧再重置并居中缩放状态；不要在图片未加载、尺寸为 0 时依赖 `react-zoom-pan-pinch` 的初始居中结果。
- 已尝试并回退 rAF 写 CSS 变量拖动、底部缩略图测量平移、Next Image 小尺寸候选配置；没有 Performance 对照验证时不要恢复。

## 预览和手势

- 图片预览缩放使用 `react-zoom-pan-pinch`；桌面双击和移动端双击都固定放大到 2.5 倍并按点击位置定位。
- 预览上下 UI 是半透明浮层，不占用图片布局空间；单击显示/隐藏，显示后 5 秒自动隐藏。
- 图片预览单击显隐需要延迟一个双击判定窗口，避免双击缩放时 UI 闪现。
- 预览大图需要保留微信内置浏览器原生长按保存能力；不要套用相册网格缩略图的禁用长按规则。
- `react-zoom-pan-pinch` 默认会让内容里的 `img` 不接收指针事件；预览大图必须覆盖为 `pointerEvents: "auto"`，否则右键/微信长按会落到外层 `div`。
- 视频预览使用原生播放器；播放中隐藏预览顶部栏和底部缩略图栏；左右切换、页面隐藏或 `pagehide` 时暂停所有预览视频并恢复 1 倍速。
- 播放中的视频支持长按画面临时 2 倍速；未播放或暂停的视频不进入倍速长按逻辑，也不调用 `preventDefault()`，保留原生长按保存。
- 相册媒体缩略图区域的长按是多选手势，必须禁用该区域原生长按菜单、拖拽和文本/图片选中；该限制只作用于网格缩略图，不作用于预览媒体。
- 相册页和回收站文件夹页的多选手势必须共用 `useMediaSelection`，不要复制两套长按、拖选、边缘自动滚动和点击抑制逻辑。
- 选择态内快速选择需要先按住 0.5 秒再拖动；拖选按开始项到当前手指位置的范围实时重算，且不能影响普通纵向滑动。

## UI 约定

- 空间入口页标题使用“选择空间”。
- 空间详情页放修改空间名称、成员管理、新建相册、回收站入口，不放上传入口；成员入口图标使用成员语义。
- 成员管理是独立页面 `/spaces/[spaceId]/members`；创建者可移除其他成员且不能被移除；非创建者可在页面底部退出空间，创建者不能退出。
- 新建空间和新建相册不使用独立页面，分别在空间入口页和相册首页用 `NameEditDialog` 弹窗创建；默认名称为“我的空间”和“我的相册”。
- 空间和相册重命名只允许空间创建者操作；全局管理员身份不额外授予空间内重命名权限。
- 相册页一次性操作错误使用 toast，不放页面内错误横幅。
- 选择态下载或删除成功后退出选择状态；选择栏中的“全选/取消全选”放在“已选择 N 项”右侧，右侧只放主操作按钮。
- 媒体预览中删除当前项后保持在预览里并切到相邻媒体；只有预览列表删空才关闭预览。
- 回收站文件夹内媒体操作使用和相册页一致的选择态批量模式；永久删除必须二次确认，恢复图标使用 `Undo2`。
- 危险确认弹窗和普通输入弹窗使用同一套卡片风格；确认弹窗取消在左、危险操作在右，危险按钮使用 `ca-confirm-button ca-danger-confirm-button`。
- 输入弹窗标题已说明字段含义时，不再额外显示重复字段 label；保留 sr-only label。
- 空间详情页卡片/列表视图是本地 UI 偏好，使用页面内 state 和 `localStorage` 记住，不写入 URL。
- 相册详情页筛选和排序不写 URL：`type` 是临时状态，默认 `all`；`sort` 是用户偏好，保存到 `localStorage`。
- 登录、注册、管理后台邀请等一次性表单结果不要用 `?error=` / `?invite=`，应直接调用 Server Action 并返回结构化结果。
- PWA 只保留基础浏览器配置：manifest、图标、Apple Web App metadata；不注册 service worker，不做自定义安装弹窗或 Fullscreen API。
- PWA 图标分普通图标和 maskable 图标；普通图标使用 `purpose: "any"`，maskable 使用满版正方形背景并单独声明 `purpose: "maskable"`。
