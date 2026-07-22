// ============================================
// axios 封装的 API 客户端
// ============================================
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

export interface SaveMeta {
  slotId: number
  timestamp: string
  turnCount: number
  locationName: string
  description: string
  version: string
}

export const gameApi = {
  /** 健康检查 */
  health: () => api.get('/game/health'),

  /** 存档 */
  save: (slotId: number) => api.post('/game/save', { slotId }),

  /** 获取存档列表 */
  listSaves: () => api.get<SaveMeta[]>('/game/saves'),

  /** 读档 */
  load: (slotId: number) => api.post('/game/load', { slotId }),

  /** AI 生成叙事 */
  generateNarrative: (prompt: string, context: any) =>
    api.post('/ai/generate', { prompt, context }),

  /** AI 对话 */
  chat: (message: string, history: any[]) =>
    api.post('/ai/chat', { message, history }),
}
