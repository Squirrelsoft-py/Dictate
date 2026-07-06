'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Upload as UploadIcon, Loader2 } from 'lucide-react';
import { uploadFile } from '@/lib/api';
import { cn } from '@/lib/utils';

const ASR_OPTIONS = [
  { id: 'local', label: 'Local (Whisper + pyannote sidecar)' },
  { id: 'openai-whisper', label: 'OpenAI Whisper' },
  { id: 'groq', label: 'Groq Whisper' },
  { id: 'deepgram', label: 'Deepgram Nova' },
  { id: 'assemblyai', label: 'AssemblyAI' },
  { id: 'openai-compatible', label: 'OpenAI-compatible' },
];

const DIARIZATION_OPTIONS = [
  { id: 'local', label: 'Local (pyannote via sidecar)' },
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'assemblyai', label: 'AssemblyAI' },
  { id: 'none', label: 'None (single speaker)' },
];

const LLM_OPTIONS = [
  { id: 'openai-compat', label: 'OpenAI-compatible (any)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic Claude' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function UploadDialog({ open, onOpenChange, onComplete }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [asrProvider, setAsrProvider] = useState('local');
  const [diarizationProvider, setDiarizationProvider] = useState('local');
  const [llmProvider, setLlmProvider] = useState('openai-compat');
  const [llmModel, setLlmModel] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'queued' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setPhase('idle');
    setProgress(0);
    setError(null);
  }

  async function onUpload() {
    if (!file) return;
    setPhase('uploading');
    setProgress(0);
    setError(null);
    try {
      const { id } = await uploadFile(file, {
        asrProvider,
        diarizationProvider,
        llmProvider,
        llmModel: llmModel || undefined,
        onProgress: setProgress,
      });
      setPhase('queued');
      onComplete();
      router.push(`/transcripts/${id}`);
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed');
      setPhase('error');
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm fade-in">
      <div className="bg-card dark:bg-card-dark rounded-2xl border border-border dark:border-border-dark w-full max-w-lg m-4 shadow-xl slide-up">
        <div className="flex items-center justify-between p-5 border-b border-border dark:border-border-dark">
          <h2 className="text-lg font-semibold">New upload</h2>
          <button onClick={() => onOpenChange(false)} className="btn-ghost p-1.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all',
                dragOver
                  ? 'border-accent bg-accent/5'
                  : 'border-border dark:border-border-dark hover:border-accent/40',
              )}
            >
              <UploadIcon className="w-8 h-8 mx-auto mb-3 text-ink-muted" />
              <p className="font-medium mb-1">Drop an audio file</p>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
                MP3, WAV, M4A — up to 2 GB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between card p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{file.name}</div>
                <div className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </div>
              </div>
              <button onClick={reset} className="btn-ghost text-xs">
                Change
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Speech-to-text</label>
              <select
                value={asrProvider}
                onChange={(e) => setAsrProvider(e.target.value)}
                className="input"
              >
                {ASR_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Speaker diarization</label>
              <select
                value={diarizationProvider}
                onChange={(e) => setDiarizationProvider(e.target.value)}
                className="input"
              >
                {DIARIZATION_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">LLM provider</label>
              <select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value)}
                className="input"
              >
                {LLM_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Model (optional)</label>
              <input
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="e.g. gpt-4o-mini"
                className="input"
              />
            </div>
          </div>

          {phase === 'uploading' && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-ink-muted dark:text-ink-dark-muted">Uploading…</span>
                <span className="text-ink-muted dark:text-ink-dark-muted">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-border dark:bg-border-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}

          {phase === 'queued' && (
            <div className="text-sm text-emerald-700 dark:text-emerald-400">
              Uploaded — processing started. Redirecting…
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl2 px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-border dark:border-border-dark">
          <button onClick={() => onOpenChange(false)} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={onUpload}
            disabled={!file || phase === 'uploading' || phase === 'queued'}
            className="btn-primary"
          >
            {phase === 'uploading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
              </>
            ) : (
              'Transcribe'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}