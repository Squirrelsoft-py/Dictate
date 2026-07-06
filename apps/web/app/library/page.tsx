'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Tag as TagIcon, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { api, type Upload } from '@/lib/api';
import { formatDate, formatBytes, cn } from '@/lib/utils';
import { UploadDialog } from '@/components/upload-dialog';

export default function LibraryPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
    }
  }, [session, isPending, router]);

  async function refresh() {
    try {
      const [u, t] = await Promise.all([api.listUploads(selectedTag ?? undefined), api.listTags()]);
      setUploads(u.uploads);
      setTags(t.tags);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, selectedTag]);

  const filtered = uploads.filter((u) =>
    u.filename.toLowerCase().includes(search.toLowerCase()),
  );

  if (isPending || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-ink-muted">Loading…</div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r border-border dark:border-border-dark p-6 flex flex-col gap-6 shrink-0">
        <Link href="/library" className="text-lg font-semibold tracking-tight">
          Dictate
        </Link>
        <button onClick={() => setUploadOpen(true)} className="btn-primary w-full">
          <Plus className="w-4 h-4" /> New upload
        </button>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted mb-2">
            Library
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                'w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors',
                selectedTag === null
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-border/40 dark:hover:bg-border-dark/40',
              )}
            >
              All uploads
            </button>
          </nav>
        </div>
        {tags.length > 0 && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted mb-2 flex items-center gap-1">
              <TagIcon className="w-3 h-3" /> Tags
            </div>
            <nav className="space-y-1">
              {tags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTag(t.name)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2',
                    selectedTag === t.name
                      ? 'bg-accent/10 text-accent'
                      : 'hover:bg-border/40 dark:hover:bg-border-dark/40',
                  )}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
            </nav>
          </div>
        )}
        <div className="mt-auto space-y-1">
          <button
            onClick={async () => {
              await signOut();
              router.push('/login');
            }}
            className="btn-ghost w-full justify-start"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted px-3 truncate">
            {session.user.email}
          </div>
        </div>
      </aside>

      <main className="flex-1 px-10 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {selectedTag ?? 'All uploads'}
            </h1>
            <p className="text-sm text-ink-muted dark:text-ink-dark-muted mt-1">
              {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-ink-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState onUpload={() => setUploadOpen(true)} />
        ) : (
          <div className="grid gap-3">
            {filtered.map((u) => (
              <UploadCard key={u.id} upload={u} onChanged={refresh} />
            ))}
          </div>
        )}
      </main>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onComplete={() => {
          setUploadOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function UploadCard({ upload, onChanged }: { upload: Upload; onChanged: () => void }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/transcripts/${upload.id}`)}
      className="card p-5 text-left hover:border-accent/40 transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate group-hover:text-accent transition-colors">
              {upload.filename}
            </h3>
            <StatusPill status={upload.status} />
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted flex items-center gap-3">
            <span>{formatDate(upload.createdAt)}</span>
            <span>·</span>
            <span>{formatBytes(upload.sizeBytes)}</span>
            {upload.durationSec ? (
              <>
                <span>·</span>
                <span>{Math.round(upload.durationSec / 60)} min</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    uploading: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    transcribing: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    diarizing: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    aligning: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    naming: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    summarizing: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  };
  return <span className={cn('chip', colors[status] ?? colors.queued)}>{status}</span>;
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="card p-16 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 text-accent mb-4">
        <Plus className="w-7 h-7" />
      </div>
      <h2 className="text-lg font-semibold mb-1">No uploads yet</h2>
      <p className="text-sm text-ink-muted dark:text-ink-dark-muted mb-6">
        Upload an audio file to get a transcript and notes.
      </p>
      <button onClick={onUpload} className="btn-primary">
        Upload your first file
      </button>
    </div>
  );
}