'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Download,
  Star,
  Trash2,
  CheckSquare,
  ListChecks,
  Lightbulb,
  GitBranch,
} from 'lucide-react';
import { api, type UploadDetail, type Segment } from '@/lib/api';
import { formatTime, cn } from '@/lib/utils';

const SPEAKER_COLORS = [
  '#FF6B35',
  '#2EC4B6',
  '#E71D36',
  '#FFBF69',
  '#3A86FF',
  '#8338EC',
  '#06A77D',
  '#D90368',
];

export default function TranscriptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<UploadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!params.id) return;
    refresh();
  }, [params.id]);

  // SSE for live progress
  useEffect(() => {
    if (!params.id || !data) return;
    if (data.upload.status === 'done' || data.upload.status === 'failed') return;
    const es = new EventSource(`/api/progress/${params.id}/stream`, { withCredentials: true });
    es.addEventListener('progress', () => {
      refresh();
    });
    return () => es.close();
  }, [params.id, data?.upload.status]);

  async function refresh() {
    try {
      const d = await api.getUpload(params.id);
      setData(d);
      setTitle(d.upload.filename);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function onRenameSpeaker(speakerId: string, customName: string) {
    if (!data) return;
    await api.renameSpeaker(data.upload.id, speakerId, customName);
    refresh();
  }

  async function onStar() {
    if (!data) return;
    await api.updateUpload(data.upload.id, { starred: !data.upload.starred });
    refresh();
  }

  async function onDelete() {
    if (!data) return;
    if (!confirm('Delete this upload and its notes?')) return;
    await api.deleteUpload(data.upload.id);
    router.push('/library');
  }

  async function onSaveTitle() {
    if (!data) return;
    await api.updateUpload(data.upload.id, { filename: title });
    setEditingTitle(false);
    refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error ?? 'Not found'}</p>
          <button onClick={() => router.push('/library')} className="btn-outline">
            Back to library
          </button>
        </div>
      </main>
    );
  }

  const { upload, transcript, notes, speakers } = data;
  const isProcessing =
    upload.status !== 'done' && upload.status !== 'failed';

  const segments: Segment[] = transcript ? JSON.parse(transcript.segmentsJson) : [];
  const parsedNotes = notes
    ? {
        summary: notes.summary,
        keyPoints: JSON.parse(notes.keyPointsJson) as string[],
        actionItems: JSON.parse(notes.actionItemsJson) as Array<{
          text: string;
          owner?: string | null;
        }>,
        decisions: JSON.parse(notes.decisionsJson) as string[],
        chapters: JSON.parse(notes.chaptersJson) as Array<{ title: string; start: number; end: number }>,
        highlights: JSON.parse(notes.highlightsJson) as Array<{
          start: number;
          end: number;
          reason: string;
        }>,
      }
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-bg/80 dark:bg-bg-dark/80 backdrop-blur-md border-b border-border dark:border-border-dark">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => router.push('/library')}
            className="btn-ghost p-2"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={onSaveTitle}
              onKeyDown={(e) => e.key === 'Enter' && onSaveTitle()}
              className="input max-w-md"
            />
          ) : (
            <h1
              className="text-lg font-medium cursor-text hover:bg-border/30 dark:hover:bg-border-dark/30 rounded-lg px-2 py-1 -mx-2 transition-colors truncate"
              onClick={() => setEditingTitle(true)}
            >
              {upload.filename}
            </h1>
          )}
          <span className="chip bg-border/50 dark:bg-border-dark/50">
            {upload.status}
          </span>
          {upload.durationSec ? (
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {Math.round(upload.durationSec / 60)} min
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={onStar} className="btn-ghost p-2" title="Star">
              <Star
                className={cn('w-4 h-4', upload.starred && 'fill-accent text-accent')}
              />
            </button>
            <a
              href={api.exportMarkdownUrl(upload.id)}
              className="btn-ghost p-2"
              title="Download markdown"
              target="_blank"
              rel="noreferrer"
            >
              <Download className="w-4 h-4" />
            </a>
            <button onClick={onDelete} className="btn-ghost p-2" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {isProcessing && <ProcessingBanner status={upload.status} />}

      {upload.status === 'failed' && upload.error && (
        <div className="max-w-3xl mx-auto px-6 mt-4">
          <div className="card p-4 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-400">
            <strong>Processing failed:</strong> {upload.error}
          </div>
        </div>
      )}

      <div className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full grid lg:grid-cols-[1fr_320px] gap-8">
        {/* Transcript column */}
        <main>
          {segments.length === 0 && isProcessing ? (
            <div className="card p-16 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-ink-muted mx-auto mb-3" />
              <p className="text-ink-muted dark:text-ink-dark-muted">
                Processing your audio. This may take a few minutes.
              </p>
            </div>
          ) : (
            <TranscriptView
              segments={segments}
              speakers={speakers}
              highlights={parsedNotes?.highlights ?? []}
              onRename={onRenameSpeaker}
            />
          )}
        </main>

        {/* Notes column */}
        <aside className="lg:sticky lg:top-20 lg:self-start space-y-5 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          {parsedNotes ? (
            <>
              <NotesPanel icon={<Lightbulb className="w-4 h-4" />} title="Summary">
                <p className="text-sm serif leading-relaxed">{parsedNotes.summary}</p>
              </NotesPanel>
              {parsedNotes.keyPoints.length > 0 && (
                <NotesPanel icon={<ListChecks className="w-4 h-4" />} title="Key Points">
                  <ul className="space-y-1.5 text-sm">
                    {parsedNotes.keyPoints.map((p, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-accent shrink-0 mt-0.5">•</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </NotesPanel>
              )}
              {parsedNotes.actionItems.length > 0 && (
                <NotesPanel icon={<CheckSquare className="w-4 h-4" />} title="Action Items">
                  <ul className="space-y-2 text-sm">
                    {parsedNotes.actionItems.map((a, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <input type="checkbox" className="mt-1 accent-accent" />
                        <div className="flex-1">
                          <span>{a.text}</span>
                          {a.owner && (
                            <span className="ml-1 text-xs text-ink-muted dark:text-ink-dark-muted">
                              · {a.owner}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </NotesPanel>
              )}
              {parsedNotes.decisions.length > 0 && (
                <NotesPanel icon={<GitBranch className="w-4 h-4" />} title="Decisions">
                  <ul className="space-y-1.5 text-sm">
                    {parsedNotes.decisions.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-accent shrink-0 mt-0.5">→</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </NotesPanel>
              )}
            </>
          ) : (
            !isProcessing && (
              <div className="card p-4 text-sm text-ink-muted dark:text-ink-dark-muted">
                No notes generated yet.
              </div>
            )
          )}
        </aside>
      </div>
    </div>
  );
}

function NotesPanel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider font-medium text-ink-muted dark:text-ink-dark-muted">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function ProcessingBanner({ status }: { status: string }) {
  const stages: Array<{ key: string; label: string }> = [
    { key: 'queued', label: 'Queued' },
    { key: 'transcribing', label: 'Transcribing' },
    { key: 'diarizing', label: 'Identifying speakers' },
    { key: 'naming', label: 'Naming speakers' },
    { key: 'summarizing', label: 'Generating notes' },
    { key: 'done', label: 'Done' },
  ];
  const currentIdx = stages.findIndex((s) => s.key === status);
  return (
    <div className="border-b border-border dark:border-border-dark bg-card/50 dark:bg-card-dark/50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-2 text-sm overflow-x-auto">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 shrink-0">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                i < currentIdx && 'bg-emerald-500',
                i === currentIdx && 'bg-accent animate-pulse',
                i > currentIdx && 'bg-border dark:bg-border-dark',
              )}
            />
            <span
              className={cn(
                'text-xs',
                i <= currentIdx
                  ? 'text-ink dark:text-ink-dark'
                  : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {s.label}
            </span>
            {i < stages.length - 1 && (
              <div className="w-6 h-px bg-border dark:bg-border-dark" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TranscriptView({
  segments,
  speakers,
  highlights,
  onRename,
}: {
  segments: Segment[];
  speakers: UploadDetail['speakers'];
  highlights: Array<{ start: number; end: number; reason: string }>;
  onRename: (speakerId: string, name: string) => void;
}) {
  const speakerColorMap = useMemo(() => {
    const m = new Map<string, string>();
    let i = 0;
    const allLabels = new Set<string>();
    for (const s of segments) allLabels.add(s.speaker);
    for (const label of allLabels) {
      const color: string = SPEAKER_COLORS[i % SPEAKER_COLORS.length] ?? '#888';
      m.set(label, color);
      i++;
    }
    return m;
  }, [segments]);

  const speakerLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of speakers) {
      const name = s.customName ?? s.suggestedName ?? s.originalLabel;
      m.set(s.originalLabel, name);
    }
    return m;
  }, [speakers]);

  const speakerIdMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of speakers) {
      m.set(s.originalLabel, s.id);
    }
    return m;
  }, [speakers]);

  function isHighlighted(seg: Segment): { highlight: typeof highlights[number] | null } {
    const mid = (seg.start + seg.end) / 2;
    for (const h of highlights) {
      if (mid >= h.start && mid <= h.end) return { highlight: h };
    }
    return { highlight: null };
  }

  let lastSpeaker = '';

  return (
    <article className="serif text-[17px] leading-relaxed">
      {segments.map((seg, i) => {
        const speaker = seg.speaker;
        const newSpeaker = speaker !== lastSpeaker;
        lastSpeaker = speaker;
        const color = speakerColorMap.get(speaker) ?? '#888';
        const displayName = speakerLabelMap.get(speaker) ?? speaker;
        const speakerId = speakerIdMap.get(speaker);
        const { highlight } = isHighlighted(seg);

        return (
          <div key={i} className="group">
            {newSpeaker && (
              <SpeakerHeader
                name={displayName}
                color={color}
                speakerId={speakerId}
                originalLabel={speaker}
                onRename={onRename}
                showRename={!!speakerId && speakerId !== displayName}
              />
            )}
            <p
              className={cn(
                'py-1 px-3 -mx-3 rounded-lg transition-colors',
                highlight && 'bg-accent/8 ring-1 ring-accent/20',
              )}
            >
              <button
                onClick={() => {
                  const el = document.getElementById('audio-player');
                  if (el) (el as HTMLAudioElement).currentTime = seg.start;
                }}
                className="text-xs font-mono text-ink-muted dark:text-ink-dark-muted hover:text-accent mr-3 tabular-nums"
              >
                {formatTime(seg.start)}
              </button>
              {seg.text}
            </p>
          </div>
        );
      })}
    </article>
  );
}

function SpeakerHeader({
  name,
  color,
  speakerId,
  originalLabel,
  onRename,
  showRename,
}: {
  name: string;
  color: string;
  speakerId?: string;
  originalLabel: string;
  onRename: (speakerId: string, name: string) => void;
  showRename: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  return (
    <div className="flex items-center gap-2 mt-6 mb-2 first:mt-0">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: color }}
      />
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (speakerId && value.trim()) onRename(speakerId, value.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (speakerId && value.trim()) onRename(speakerId, value.trim());
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="text-sm font-medium bg-transparent border-b border-accent outline-none"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-medium sans-serif hover:text-accent transition-colors"
          title={showRename ? 'Click to rename' : ''}
        >
          {name}
          {showRename && originalLabel !== name && (
            <span className="ml-2 text-xs text-ink-muted dark:text-ink-dark-muted">
              ({originalLabel})
            </span>
          )}
        </button>
      )}
    </div>
  );
}