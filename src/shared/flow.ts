import type { AspectRatio, ModelOption } from './types'

/**
 * Model catalog for Google Flow, reached through a local `gflow-openai serve` bridge
 * (see src/main/services/flow-bridge.ts). Model ids are namespaced `flow/...`
 * so the app can tell them apart from Higgsfield's catalog.
 *
 * Note: the serve HTTP layer only does text-to-image (no reference images),
 * so Flow image models never use character sheets.
 */

export interface FlowModel {
  id: string
  name: string
  family: string
  kind: 'image' | 'video'
  /** Model string the gflow-openai serve HTTP API understands. */
  gflowModel: string
  /** Allowed clip lengths in seconds (video only). */
  durations: number[] | null
  tags: string[]
  description: string
}

export const FLOW_IMAGE_MODELS: FlowModel[] = [
  {
    id: 'flow/imagen-4',
    name: 'Imagen 4',
    family: 'Imagen',
    kind: 'image',
    gflowModel: 'image4',
    durations: null,
    tags: ['Flow'],
    description: 'Gambar kualitas tinggi dari Google · tanpa lembar karakter'
  },
  {
    id: 'flow/nano-banana-2',
    name: 'Nano Banana 2',
    family: 'Nano Banana',
    kind: 'image',
    gflowModel: 'nano2',
    durations: null,
    tags: ['Flow'],
    description: 'Cepat dan konsisten, jago mengikuti instruksi · tanpa lembar karakter'
  },
  {
    id: 'flow/nano-banana-pro',
    name: 'Nano Banana Pro',
    family: 'Nano Banana',
    kind: 'image',
    gflowModel: 'nano-pro',
    durations: null,
    tags: ['Flow'],
    description: 'Kualitas tertinggi keluarga Nano Banana · tanpa lembar karakter'
  }
]

export const FLOW_VIDEO_MODELS: FlowModel[] = [
  {
    id: 'flow/veo-quality',
    name: 'Veo Quality',
    family: 'Veo',
    kind: 'video',
    gflowModel: 'veo-quality',
    durations: [4, 6, 8],
    tags: ['Flow', 'Rekomendasi'],
    description: 'Kualitas terbaik · mulai dari gambar klip'
  },
  {
    id: 'flow/veo-fast',
    name: 'Veo Fast',
    family: 'Veo',
    kind: 'video',
    gflowModel: 'veo-fast',
    durations: [4, 6, 8],
    tags: ['Flow'],
    description: 'Lebih cepat, kualitas sedikit di bawah Quality'
  },
  {
    id: 'flow/veo-lite',
    name: 'Veo Lite',
    family: 'Veo',
    kind: 'video',
    gflowModel: 'veo-lite',
    durations: [4, 6, 8],
    tags: ['Flow'],
    description: 'Paling hemat kredit · cocok untuk draf'
  },
  {
    id: 'flow/omni-flash',
    name: 'Omni Flash',
    family: 'Veo',
    kind: 'video',
    gflowModel: 'omni-flash',
    durations: [4, 6, 8, 10],
    tags: ['Flow'],
    description: 'Satu-satunya yang bisa 10 detik per klip'
  }
]

export function isFlowModel(id: string | null | undefined): boolean {
  return !!id && id.startsWith('flow/')
}

export function getFlowImageModel(id: string | null | undefined): FlowModel {
  return FLOW_IMAGE_MODELS.find((m) => m.id === id) ?? FLOW_IMAGE_MODELS[0]
}

export function getFlowVideoModel(id: string | null | undefined): FlowModel {
  return FLOW_VIDEO_MODELS.find((m) => m.id === id) ?? FLOW_VIDEO_MODELS[0]
}

/** The clip length to request: the shortest allowed length that covers it, or the longest. */
export function fitFlowDuration(m: FlowModel, seconds: number): 4 | 6 | 8 | 10 {
  const values = [...(m.durations ?? [8])].sort((a, b) => a - b)
  const want = Math.max(1, Math.ceil(seconds))
  const picked = values.find((v) => v >= want) ?? values[values.length - 1]
  return Math.min(10, Math.max(4, picked)) as 4 | 6 | 8 | 10
}

export function flowDurationLabel(m: FlowModel): string {
  return `${(m.durations ?? [8]).join(' / ')} dtk`
}

/** Picker rows for the model menus. */
export function flowModelOptions(kind: 'image' | 'video'): ModelOption[] {
  const list = kind === 'image' ? FLOW_IMAGE_MODELS : FLOW_VIDEO_MODELS
  return list.map((m) => ({
    id: m.id,
    name: m.name,
    family: m.family,
    description: m.description,
    tags: m.tags
  }))
}

/** Size string the serve API accepts for the project's aspect ratio. */
export function flowSize(aspect: AspectRatio, kind: 'image' | 'video'): string {
  if (kind === 'image') return aspect
  return aspect === '16:9' ? '1280x720' : '720x1280'
}
