import { ScrollArea } from '@/components/ui/scroll-area'

/** 叙事面板 — 显示故事文本 */
export function NarrativePanel({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="flex flex-1 items-center justify-center p-5 text-sm text-muted-foreground">
        等待命运的齿轮开始转动...
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-[52vh] flex-1 p-5 lg:min-h-[calc(100vh-10rem)]">
      <div className="mx-auto max-w-3xl whitespace-pre-wrap text-[15px] leading-8 animate-fade-in">
        {text}
      </div>
    </ScrollArea>
  )
}
