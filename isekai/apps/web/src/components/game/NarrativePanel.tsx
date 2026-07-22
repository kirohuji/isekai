import { ScrollArea } from '@/components/ui/scroll-area'

/** 叙事面板 — 显示故事文本 */
export function NarrativePanel({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        等待命运的齿轮开始转动...
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 border border-border rounded p-4">
      <div className="text-sm leading-relaxed whitespace-pre-wrap animate-fade-in">
        {text}
      </div>
    </ScrollArea>
  )
}
