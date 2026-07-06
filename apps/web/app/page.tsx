import Link from 'next/link';
import { Mic } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-reading text-center fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 text-accent mb-6">
          <Mic className="w-8 h-8" strokeWidth={2.25} />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mb-3">Dictate</h1>
        <p className="text-lg text-ink-muted dark:text-ink-dark-muted mb-8 serif">
          Upload an audio file. Get a speaker-attributed transcript and structured notes.
          Self-hosted, open-source, any LLM.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/signup" className="btn-primary">
            Get started
          </Link>
          <Link href="/login" className="btn-outline">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}