import { useCallback, useRef, useState } from 'react';
import {
  hashFile,
  generateEncryptionKey,
  encrypt,
  exportKey,
  bytesToHex,
  createLog,
  appendEvent,
} from '@witness/crypto-core';
import { addEvidence, storeBlob } from '../store/evidenceStore';
import type { EvidenceType } from '../store/db';

export type CaptureState =
  | { phase: 'idle' }
  | { phase: 'previewing'; stream: MediaStream }
  | { phase: 'recording'; stream: MediaStream; recorder: MediaRecorder; startedAt: number }
  | { phase: 'processing' }
  | { phase: 'done'; hash: string; type: EvidenceType }
  | { phase: 'error'; message: string };

function randomId(): string {
  return crypto.randomUUID();
}

export function useCapture(onSaved: () => void) {
  const [state, setState] = useState<CaptureState>({ phase: 'idle' });
  const chunksRef = useRef<Blob[]>([]);

  // ── Process a captured Blob through crypto-core and persist ──────────────
  async function processBlob(blob: Blob, type: EvidenceType) {
    setState({ phase: 'processing' });
    try {
      const buffer = await blob.arrayBuffer();
      const hash = await hashFile(buffer);
      const key = await generateEncryptionKey();
      const { ciphertext, iv } = await encrypt(key, buffer);
      const rawKey = await exportKey(key);

      const id = randomId();
      await storeBlob(id, ciphertext);

      let log = createLog(id);
      log = await appendEvent(log, 'captured', { type, hash });
      log = await appendEvent(log, 'encrypted', { algorithm: 'AES-256-GCM' });
      log = await appendEvent(log, 'queued');

      await addEvidence({
        id,
        type,
        hash,
        ivHex: bytesToHex(iv),
        keyHex: bytesToHex(new Uint8Array(rawKey)),
        capturedAt: Date.now(),
        sizeBytes: buffer.byteLength,
        status: 'queued',
        custodyLog: log,
      });

      setState({ phase: 'done', hash, type });
      onSaved();
    } catch (err) {
      setState({ phase: 'error', message: String(err) });
    }
  }

  // ── Photo ─────────────────────────────────────────────────────────────────
  const startPhotoPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setState({ phase: 'previewing', stream });
    } catch {
      setState({ phase: 'error', message: 'Camera access denied' });
    }
  }, []);

  const snapPhoto = useCallback(
    async (videoEl: HTMLVideoElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      canvas.getContext('2d')!.drawImage(videoEl, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        if (state.phase === 'previewing') {
          state.stream.getTracks().forEach((t) => t.stop());
        }
        await processBlob(blob, 'photo');
      }, 'image/jpeg', 0.92);
    },
    [state]
  );

  // ── Video ─────────────────────────────────────────────────────────────────
  const startVideo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(500);
      setState({ phase: 'recording', stream, recorder, startedAt: Date.now() });
    } catch {
      setState({ phase: 'error', message: 'Camera/mic access denied' });
    }
  }, []);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(500);
      setState({ phase: 'recording', stream, recorder, startedAt: Date.now() });
    } catch {
      setState({ phase: 'error', message: 'Microphone access denied' });
    }
  }, []);

  // ── Stop recording (video or audio) ──────────────────────────────────────
  const stopRecording = useCallback(
    (type: 'video' | 'audio') => {
      if (state.phase !== 'recording') return;
      const { recorder, stream } = state;
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: type === 'video' ? 'video/webm' : 'audio/webm',
        });
        await processBlob(blob, type);
      };
      recorder.stop();
    },
    [state]
  );

  const dismiss = useCallback(() => {
    if (state.phase === 'previewing') {
      state.stream.getTracks().forEach((t) => t.stop());
    }
    setState({ phase: 'idle' });
  }, [state]);

  return { state, startPhotoPreview, snapPhoto, startVideo, startAudio, stopRecording, dismiss };
}
