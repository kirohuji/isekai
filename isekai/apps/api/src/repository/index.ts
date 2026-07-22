// ============================================
// 内存仓库 —— 从 CSV 加载的数据存入内存
// 开发和早期测试用。后期换成 PrismaRepo 查 SQLite。
// ============================================
import { loadAllData } from '../data/loader'
import type { LocationDef, NpcDef, ItemDef, SkillDef, EventTemplateDef } from '../engine/types'

let _data: ReturnType<typeof loadAllData> | null = null

function getData() {
  if (!_data) _data = loadAllData()
  return _data
}

export const locationRepo = {
  getById: (id: number): LocationDef | null => getData().locations.find(l => l.id === id) ?? null,
  getAll: (): LocationDef[] => getData().locations,
  getByTag: (tag: string): LocationDef[] => getData().locations.filter(l => l.tags.includes(tag)),
  getConnected: (locationId: number) => {
    const loc = getData().locations.find(l => l.id === locationId)
    return loc?.connections ?? []
  },
}

export const npcRepo = {
  getById: (id: number): NpcDef | null => getData().npcs.find(n => n.id === id) ?? null,
  getAll: (): NpcDef[] => getData().npcs,
  getByLocation: (locationId: number): NpcDef[] =>
    getData().npcs.filter(n => n.locationId === locationId),
}

export const itemRepo = {
  getById: (id: number): ItemDef | null => getData().items.find(i => i.id === id) ?? null,
  getByType: (type: string): ItemDef[] => getData().items.filter(i => i.type === type),
  getAll: (): ItemDef[] => getData().items,
}

export const eventTemplateRepo = {
  getById: (id: number): EventTemplateDef | null => getData().eventTemplates.find(e => e.id === id) ?? null,
  getByCategory: (category: string): EventTemplateDef[] =>
    getData().eventTemplates.filter(e => e.category === category),
  getAll: (): EventTemplateDef[] => getData().eventTemplates,
}

export const skillRepo = {
  getById: (id: string): SkillDef | null => getData().skills.find(s => s.id === id) ?? null,
  getByCategory: (category: string): SkillDef[] => getData().skills.filter(s => s.category === category),
  getAll: (): SkillDef[] => getData().skills,
}

// 重新加载数据（开发中改了 CSV 后调用）
export function reloadData() { _data = null; _data = loadAllData() }
