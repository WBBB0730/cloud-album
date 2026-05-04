export function LoadingState({ title = '加载中' }: { title?: string }) {
  return (
    <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">
      {title}
    </div>
  )
}
