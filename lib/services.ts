import { newsRequest } from '@/lib/api'
import type { Article, Script } from '@/lib/mock-data'
import type { NewsSource } from '@/lib/server/store'

export const sourceService = {
  getAll: () => newsRequest<NewsSource[]>('sources'),
  getById: async (id: string) => (await newsRequest<NewsSource[]>('sources')).find(s => s.id === id),
  create: (data: Pick<NewsSource, 'name' | 'url'>) => newsRequest<NewsSource>('sources', 'POST', data),
  update: (id: string, changes: Pick<Partial<NewsSource>, 'name' | 'url' | 'active'>) => newsRequest<NewsSource>(`sources/${id}`, 'PATCH', changes),
  remove: (id: string) => newsRequest<{ deleted: boolean }>(`sources/${id}`, 'DELETE'),
  scan: (sourceId?: string) => newsRequest('scan', 'POST', { sourceId }),
  runPipeline: (sourceId?: string) => newsRequest('pipeline', 'POST', { sourceId }),
}
export const articleService = {
  getAll: () => newsRequest<Article[]>('articles'),
  getById: (id: string) => newsRequest<Article>(`articles/${id}`),
  setStarred: (id: string, starred: boolean) => newsRequest<Article>(`articles/${id}`, 'PATCH', { starred }),
  scrape: (sourceId: string, url: string) => newsRequest<Article>('articles', 'POST', { sourceId, url }),
  generate: (id: string) => newsRequest<Script>(`articles/${id}/generate`, 'POST', {}),
}
export const scriptService = {
  getAll: () => newsRequest<Script[]>('scripts'),
  getById: (id: string) => newsRequest<Script>(`scripts/${id}`),
  setStarred: (id: string, starred: boolean) => newsRequest<Script>(`scripts/${id}`, 'PATCH', { starred }),
}
