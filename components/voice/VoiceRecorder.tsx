import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, X, FileText, ListChecks, Save } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { useAIStore } from '@/stores/aiStore';
import { addVoiceTranscript } from '@/lib/aiDb';
import { createRecognizer, isSpeechRecognitionSupported } from '@/lib/voice';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function VoiceRecorder({ open, onClose }: Props) {
  const supported = isSpeechRecognitionSupported();
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const startedAtRef = useRef<number>(0);
  const finalRef = useRef<string>('');
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activePage = useEditorStore(s => s.activePage());
  const addBlock = useEditorStore(s => s.addBlock);
  const generateTasksForPage = useAIStore(s => s.generateTasksForPage);
  const summarizePage = useAIStore(s => s.summarizePage);

  useEffect(() => {
    if (!open) {
      stop();
      setText('');
      setInterim('');
      setError(null);
      finalRef.current = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function start() {
    setError(null);
    if (!supported) {
      setError('Speech recognition is not supported in this browser. Try Chrome/Edge on desktop.');
      return;
    }
    const rec = createRecognizer('en-US');
    if (!rec) return;
    recRef.current = rec;
    startedAtRef.current = Date.now();
    finalRef.current = text ? text + ' ' : '';
    rec.onresult = (e) => {
      let interimChunk = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + ' ';
        else interimChunk += r[0].transcript;
      }
      setText(finalRef.current);
      setInterim(interimChunk);
    };
    rec.onerror = (e) => {
      setError(`Speech error: ${e.error || 'unknown'}`);
      setRecording(false);
    };
    rec.onend = () => {
      setRecording(false);
      setInterim('');
    };
    try {
      rec.start();
      setRecording(true);
    } catch (err) {
      setError(String(err));
    }
  }

  function stop() {
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    setRecording(false);
  }

  async function persistTranscript(): Promise<string> {
    const finalText = (text + (interim ? ' ' + interim : '')).trim();
    if (!finalText) return '';
    await addVoiceTranscript({
      pageId: activePage?.id ?? null,
      text: finalText,
      durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : undefined,
    });
    return finalText;
  }

  async function insertIntoNote() {
    const finalText = await persistTranscript();
    if (!finalText || !activePage) { onClose(); return; }
    addBlock(undefined, 'heading3', '🎙️ Voice note');
    addBlock(undefined, 'text', finalText);
    onClose();
  }

  async function saveOnly() {
    await persistTranscript();
    onClose();
  }

  async function tasksFromVoice() {
    const finalText = await persistTranscript();
    if (!finalText || !activePage) return;
    addBlock(undefined, 'heading3', '🎙️ Voice note');
    addBlock(undefined, 'text', finalText);
    onClose();
    generateTasksForPage(activePage.id, activePage.title || 'Untitled', finalText);
  }

  async function summarize() {
    const finalText = await persistTranscript();
    if (!finalText || !activePage) return;
    addBlock(undefined, 'heading3', '🎙️ Voice note');
    addBlock(undefined, 'text', finalText);
    onClose();
    summarizePage(activePage.id, activePage.title || 'Untitled', finalText);
  }

  if (!open) return null;
  const hasText = (text + interim).trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Mic size={15} className="text-primary" /> Voice note
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary">
            <X size={15} />
          </button>
        </div>

        {!supported && (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            Web Speech API isn't available here. Use Chrome or Edge desktop. Recordings will still be stored as text if you type/paste below.
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          {!recording ? (
            <button
              onClick={start}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Mic size={13} /> Start recording
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90"
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          )}
          {recording && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> Listening…
            </span>
          )}
        </div>

        <textarea
          value={text + (interim ? ' ' + interim : '')}
          onChange={(e) => { setText(e.target.value); finalRef.current = e.target.value; setInterim(''); }}
          placeholder="Your transcript will appear here…"
          rows={6}
          className="w-full resize-none rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />

        {error && <div className="mt-2 text-xs text-destructive">{error}</div>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={insertIntoNote}
            disabled={!hasText || !activePage}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            <FileText size={12} /> Insert into note
          </button>
          <button
            onClick={tasksFromVoice}
            disabled={!hasText || !activePage}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-40"
          >
            <ListChecks size={12} /> Generate tasks
          </button>
          <button
            onClick={summarize}
            disabled={!hasText || !activePage}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-40"
          >
            ✨ Summarize
          </button>
          <button
            onClick={saveOnly}
            disabled={!hasText}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            <Save size={12} /> Save transcript only
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          All transcripts are stored locally in IndexedDB. Future Whisper integration will reuse the same store.
        </p>
      </div>
    </div>
  );
}
