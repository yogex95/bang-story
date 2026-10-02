import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Film, Image as ImageIcon, Move, Users } from 'lucide-react'
import { effectiveResolution, fitDuration, getImageModel, getVideoModel, hfModelOptions, maxRefs, resolutionOptions } from '@shared/higgsfield'
import { fitFlowDuration, flowModelOptions, getFlowImageModel, getFlowVideoModel, isFlowModel } from '@shared/flow'
import type { CreditEstimate, ModelOption, Project } from '@shared/types'
import { ModelLogo } from '../../components/ModelLogo'
import { ModelPicker } from '../../components/ModelPicker'
import { Segmented, Spinner } from '../../components/ui'
import { creditLabel } from '../../lib/format'
import { useEstimate, useEstimates } from '../../lib/useEstimate'

const IMAGE_OPTIONS = [...hfModelOptions('image'), ...flowModelOptions('image')]
const VIDEO_OPTIONS = [...hfModelOptions('video'), ...flowModelOptions('video')]
const IMAGE_IDS = IMAGE_OPTIONS.map((o) => o.id)
const VIDEO_IDS = VIDEO_OPTIONS.map((o) => o.id)

function creditUnit(kind: 'image' | 'video', id: string, perClip: number): string {
  if (kind === 'image') return ''
  const dtk = isFlowModel(id) ? fitFlowDuration(getFlowVideoModel(id), perClip) : fitDuration(getVideoModel(id), perClip)
  return `${dtk} dtk`
}

/** Adds each model's estimated credits to its picker row once a Higgsfield key is known to exist. */
function withCosts(
  options: ModelOption[],
  costs: Record<string, CreditEstimate | null>,
  kind: 'image' | 'video',
  perClip: number,
  on: boolean
): ModelOption[] {
  if (!on) return options
  return options.map((o) => ({
    ...o,
    credits: o.id in costs ? (costs[o.id]?.credits ?? null) : undefined,
    usd: costs[o.id]?.usd ?? null,
    creditUnit: creditUnit(kind, o.id, perClip)
  }))
}

function Cost({
  value,
  hasKey,
  children
}: {
  value: CreditEstimate | null | undefined
  hasKey: boolean | null
  children: (credits: number) => ReactNode
}) {
  if (hasKey === false) return <span className="text-muted">Perkiraan kredit muncul setelah kunci Higgsfield diisi di Pengaturan.</span>
  if (value === undefined)
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <Spinner className="size-3" />
        Menghitung kredit…
      </span>
    )
  if (value === null) return <span className="text-muted">Perkiraan kredit belum tersedia.</span>
  return <span>{children(value.credits)}</span>
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line-2 bg-surface p-3">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        {icon}
        {title}
      </span>
      {children}
    </div>
  )
}

/** Which AI models draw and animate this project's clips — Higgsfield or Google Flow. */
export function ModelSection({
  project,
  clipCount,
  perClip,
  onChange
}: {
  project: Project
  clipCount: number
  perClip: number
  onChange: (patch: { imageModel?: string; videoModel?: string; videoResolution?: string | null }) => void
}) {
  const imageFlow = isFlowModel(project.imageModel)
  const videoFlow = isFlowModel(project.videoModel)
  const hfImage = imageFlow ? null : getImageModel(project.imageModel)
  const hfVideo = videoFlow ? null : getVideoModel(project.videoModel)
  const flImage = imageFlow ? getFlowImageModel(project.imageModel) : null
  const flVideo = videoFlow ? getFlowVideoModel(project.videoModel) : null

  const imageId = flImage?.id ?? hfImage!.id
  const videoId = flVideo?.id ?? hfVideo!.id
  const seconds = videoFlow ? fitFlowDuration(flVideo!, perClip) : (fitDuration(hfVideo!, perClip) ?? perClip)
  const imageCost = useEstimate('image', imageId, project.aspectRatio)
  const resolutions = videoFlow ? [] : resolutionOptions(hfVideo!)
  const resolution = videoFlow ? null : effectiveResolution(hfVideo!, project.videoResolution)
  const videoCost = useEstimate('video', videoId, project.aspectRatio, perClip, resolution)
  const [keys, setKeys] = useState<{ higgsfield: boolean; flow: boolean } | null>(null)

  useEffect(() => {
    void window.api.settings.keys().then((ks) =>
      setKeys({
        higgsfield: !!ks.find((k) => k.provider === 'higgsfield')?.configured,
        flow: !!ks.find((k) => k.provider === 'flow')?.configured
      })
    )
  }, [])

  const imageCosts = useEstimates('image', IMAGE_IDS, project.aspectRatio, undefined, keys?.higgsfield === true)
  const videoCosts = useEstimates('video', VIDEO_IDS, project.aspectRatio, perClip, keys?.higgsfield === true)
  const imageModels = useMemo(() => withCosts(IMAGE_OPTIONS, imageCosts, 'image', perClip, keys?.higgsfield === true), [imageCosts, keys, perClip])
  const videoModels = useMemo(
    () => withCosts(VIDEO_OPTIONS, videoCosts, 'video', perClip, keys?.higgsfield === true),
    [videoCosts, keys, perClip]
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">Model AI</span>
        <span className="text-[13px] text-muted">
          {IMAGE_OPTIONS.length} model gambar dan {VIDEO_OPTIONS.length} model video dari Higgsfield dan Google Flow
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card icon={<ImageIcon className="size-4" />} title="Gambar klip">
          <ModelPicker
            value={imageId}
            models={imageModels}
            footerNote={
              imageFlow
                ? keys?.flow
                  ? 'memakai kredit langganan Google AI kamu'
                  : 'isi API key gflow-openai di Pengaturan dulu'
                : keys?.higgsfield
                  ? 'kredit per gambar, perkiraan Higgsfield untuk akunmu'
                  : undefined
            }
            renderIcon={(m) => <ModelLogo family={m.family} />}
            detail="description"
            tagFilters={['Rekomendasi', 'Referensi', 'GPT Image', 'Soul', 'Recraft', 'Flow', '4K']}
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ imageModel: id })}
          />
          {imageFlow ? (
            <p className="text-[12.5px] leading-snug text-ink-2">
              Memakai kredit langganan Google AI kamu — pastikan <b className="font-semibold text-ink">gflow-openai serve</b> menyala di komputer ini.
            </p>
          ) : (
            <p className="text-[12.5px] leading-snug text-ink-2">
              <Cost value={imageCost} hasKey={keys?.higgsfield ?? null}>
                {(c) => (
                  <>
                    ≈ {creditLabel(c)} kredit per gambar · {clipCount} gambar ≈{' '}
                    <b className="font-semibold text-ink">{creditLabel(c * clipCount)} kredit</b>
                  </>
                )}
              </Cost>
            </p>
          )}
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Users className="mt-px size-3.5 shrink-0" />
            {imageFlow
              ? 'Tanpa lembar karakter — gflow belum bisa menerima gambar referensi, jadi ciri tokoh dijaga lewat deskripsi kata.'
              : maxRefs(hfImage!)
                ? 'Pakai lembar karakter, jadi wajah dan kostum tokoh tetap sama di tiap klip.'
                : 'Tanpa lembar karakter, jadi tampilan tokoh bisa sedikit berubah antar klip.'}
          </p>
        </Card>
        <Card icon={<Film className="size-4" />} title="Video AI">
          <ModelPicker
            value={videoId}
            models={videoModels}
            footerNote={
              videoFlow
                ? keys?.flow
                  ? `memakai kredit langganan Google AI kamu, klip ${seconds} detik`
                  : 'isi API key gflow-openai di Pengaturan dulu'
                : keys?.higgsfield
                  ? `kredit per video untuk klip ±${perClip} detik`
                  : undefined
            }
            renderIcon={(m) => <ModelLogo family={m.family} />}
            detail="description"
            tagFilters={['Rekomendasi', 'Kling', 'Seedance', 'Wan', 'Referensi', 'Flow', '4K']}
            align="right"
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ videoModel: id })}
          />
          {!videoFlow &&
            (resolutions.length > 1 ? (
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 text-[12.5px] font-medium text-ink-2">Resolusi</span>
                <Segmented
                  size="sm"
                  value={resolution ?? resolutions[0]}
                  onChange={(v) => onChange({ videoResolution: v })}
                  options={resolutions.map((r) => ({ id: r, label: r.toUpperCase() === '4K' || r.toUpperCase() === '2K' ? r.toUpperCase() : r }))}
                  className="min-w-0 flex-1"
                />
              </div>
            ) : (
              resolution && <p className="text-[12.5px] text-ink-2">Resolusi {resolution} (satu-satunya pilihan model ini)</p>
            ))}
          {videoFlow ? (
            <p className="text-[12.5px] leading-snug text-ink-2">
              Video {seconds} detik dari gambar klip · memakai kredit langganan Google AI kamu.
            </p>
          ) : (
            <p className="text-[12.5px] leading-snug text-ink-2">
              <Cost value={videoCost} hasKey={keys?.higgsfield ?? null}>
                {(c) => (
                  <>
                    ≈ {creditLabel(c)} kredit per video {seconds} detik{resolution ? `, ${resolution}` : ''}
                  </>
                )}
              </Cost>
            </p>
          )}
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Move className="mt-px size-3.5 shrink-0" />
            Hanya untuk klip yang kamu jadikan Video AI. Gerak kamera tetap gratis.
          </p>
        </Card>
      </div>
    </div>
  )
}
