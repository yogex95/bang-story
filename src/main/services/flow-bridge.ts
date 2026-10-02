import { readFile } from 'node:fs/promises'
import type { KeyTestResult } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { ApiError, readError, sleep } from './http'

/**
 * Client for `gflow-openai serve`: an unofficial local bridge that drives Google Flow's
 * private API using the user's own Google AI subscription credits.
 *
 * The bridge is a separate process the user runs next to Bang Story
 * (`gflow-openai serve --host 127.0.0.1 --port 8000`, with GFLOW_OPENAI_API_KEY set). This client only
 * talks HTTP to it; it never touches Google credentials itself.
 *
 * HTTP contract (from haizhuflow2api's openai_compat layer):
 * - GET  /health/live, /health/ready          (no auth)
 * - GET  /v1/models                           (Bearer auth)
 * - POST /v1/images/generations               (sync, returns b64_json inline)
 * - POST /v1/videos  (multipart, input_reference file -> i2v; async job)
 * - GET  /v1/videos/{id}                      (poll status)
 * - GET  /v1/videos/{id}/content              (mp4 download)
 * - DELETE /v1/videos/{id}                    (only finished jobs)
 */

// Dev builds can point at a differently-hosted bridge.
const BASE = process.env.STUDIO_FLOW_BASE || 'http://127.0.0.1:8000'

export type FlowVideoStatus = 'queued' | 'in_progress' | 'completed' | 'failed'

export interface FlowVideoInfo {
  status: FlowVideoStatus
  progress: number
  error?: string
}

function friendly(status: number, detail: string): ApiError {
  if (status === 401) return new ApiError('API key gflow salah. Samakan dengan GFLOW_OPENAI_API_KEY saat menjalankan gflow-openai serve.', status)
  if (status === 404) return new ApiError('Server gflow tidak mengenal endpoint ini. Perbarui gflow ke versi terbaru.', status)
  if (status === 409) return new ApiError(detail || 'Operasi ini belum bisa dilakukan untuk video yang masih berjalan.', status)
  if (status === 429) return new ApiError('gflow sedang sibuk. Tunggu sebentar lalu coba lagi.', status, true)
  if (status >= 500) return new ApiError(`Server gflow bermasalah (${status}).`, status, true)
  return new ApiError(`gflow menolak permintaan: ${detail}`, status)
}

async function flow<T>(path: string, init: RequestInit & { key?: string; anonymous?: boolean } = {}): Promise<T> {
  const { key, anonymous, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: {
        ...(anonymous ? {} : { Authorization: `Bearer ${key ?? requireSecret('flow')}` }),
        ...(rest.headers ?? {})
      }
    })
  } catch {
    throw new ApiError(
      'Server gflow belum jalan. Jalankan "gflow-openai serve" di komputer ini dulu, lalu coba lagi.',
      0,
      true
    )
  }
  if (!res.ok) throw friendly(res.status, await readError(res))
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

/** True when the bridge process answers at all (no key needed). */
export async function bridgeLive(): Promise<boolean> {
  try {
    const out = await flow<{ status: string }>('/health/live', { anonymous: true })
    return out.status === 'ok'
  } catch {
    return false
  }
}

/** True when the bridge is logged in and able to generate (no key needed). */
export async function bridgeReady(): Promise<boolean> {
  try {
    const out = await flow<{ status: string }>('/health/ready', { anonymous: true })
    return out.status === 'ready'
  } catch {
    return false
  }
}

export async function testCredentials(key?: string): Promise<KeyTestResult> {
  if (!(await bridgeLive()))
    return {
      ok: false,
      message: 'Server gflow belum jalan di komputer ini. Jalankan "gflow-openai serve" dulu (lihat panduan di bawah).'
    }
  const k = key ?? getSecret('flow')
  if (!k) return { ok: false, message: 'API key belum diatur' }
  try {
    await flow('/v1/models', { key: k })
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  const ready = await bridgeReady()
  return {
    ok: true,
    message: ready ? 'Terhubung · gflow siap (memakai kredit langganan Flow kamu)' : 'Terhubung · tapi gflow belum login ke akun Google (jalankan "gflow auth login --browser chrome")'
  }
}

/**
 * Generates one image. The serve endpoint is synchronous: it waits for Flow to
 * finish, so callers should pass the job's AbortSignal and expect minutes.
 */
export async function generateImage(opts: {
  prompt: string
  model: string
  size: string
  signal?: AbortSignal
}): Promise<Buffer> {
  const out = await flow<{ data?: { b64_json?: string }[] }>(
    '/v1/images/generations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: opts.prompt, model: opts.model, size: opts.size, response_format: 'b64_json' }),
      signal: opts.signal
    }
  )
  const b64 = out.data?.[0]?.b64_json
  if (!b64) throw new ApiError('gflow selesai tanpa gambar. Coba lagi.', 500, true)
  return Buffer.from(b64, 'base64')
}

/** Submits an image-to-video job. The clip image is uploaded as multipart input_reference. */
export async function submitVideo(opts: {
  prompt: string
  model: string
  seconds: 4 | 6 | 8 | 10
  size: string
  imagePath: string
  signal?: AbortSignal
}): Promise<string> {
  const bytes = await readFile(opts.imagePath)
  const form = new FormData()
  form.append('prompt', opts.prompt)
  form.append('model', opts.model)
  form.append('seconds', String(opts.seconds))
  form.append('size', opts.size)
  form.append('quality', 'standard')
  form.append('input_reference', new Blob([bytes], { type: 'image/png' }), 'frame.png')
  const out = await flow<{ id: string }>('/v1/videos', { method: 'POST', body: form, signal: opts.signal })
  if (!out.id) throw new ApiError('gflow tidak mengembalikan id video.', 500, true)
  return out.id
}

export async function getVideoStatus(videoId: string, signal?: AbortSignal): Promise<FlowVideoInfo> {
  const out = await flow<{ status: FlowVideoStatus; progress?: number; error?: { message?: string } }>(
    `/v1/videos/${videoId}`,
    { signal }
  )
  return { status: out.status, progress: out.progress ?? 0, error: out.error?.message }
}

export async function downloadVideo(videoId: string, signal?: AbortSignal): Promise<Buffer> {
  let res: Response
  try {
    res = await fetch(`${BASE}/v1/videos/${videoId}/content`, {
      headers: { Authorization: `Bearer ${requireSecret('flow')}` },
      signal
    })
  } catch {
    throw new ApiError('Server gflow belum jalan.', 0, true)
  }
  if (!res.ok) throw friendly(res.status, await readError(res))
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Best-effort cancel. The serve API only deletes finished jobs, so a running
 * Flow generation keeps going (and spending credits) server-side; this just
 * stops our side from waiting on it.
 */
export async function cancelVideo(videoId: string): Promise<void> {
  try {
    await flow(`/v1/videos/${videoId}`, { method: 'DELETE' })
  } catch {
    // Running jobs cannot be deleted; the poll loop is aborted via signal anyway.
  }
}

/** Polls until the video finishes. Starts at 5 s and backs off to 15 s. */
export async function waitForVideo(
  videoId: string,
  onTick: (status: FlowVideoStatus, progress: number, elapsedMs: number) => void,
  signal?: AbortSignal,
  timeoutMs = 30 * 60 * 1000
): Promise<void> {
  const started = Date.now()
  let delay = 5000
  let failures = 0
  for (;;) {
    if (Date.now() - started > timeoutMs) throw new Error('Flow terlalu lama merespons. Coba lagi nanti.')
    let info: FlowVideoInfo
    try {
      info = await getVideoStatus(videoId, signal)
      failures = 0
    } catch (e) {
      if (signal?.aborted) throw e
      if (e instanceof ApiError && !e.retryable) throw e
      if (++failures > 8) throw e
      await sleep(delay, signal)
      continue
    }
    onTick(info.status, info.progress, Date.now() - started)
    if (info.status === 'completed') return
    if (info.status === 'failed') throw new Error(`Flow gagal membuat video: ${info.error ?? 'tanpa keterangan'}`)
    await sleep(delay + Math.random() * 1000, signal)
    delay = Math.min(15_000, delay * 1.4)
  }
}
