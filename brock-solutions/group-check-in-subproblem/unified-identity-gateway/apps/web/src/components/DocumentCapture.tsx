import { useEffect, useRef, useState } from 'react';
import { compareFaces, getFaceDescriptor, loadModels, NoFaceDetectedError } from '../faceMatch';

type Stage = 'starting' | 'camera-error' | 'passport' | 'face' | 'comparing' | 'result';

export interface DocumentCaptureResult {
  faceMatchPassed: boolean;
  faceMatchScore: number | null;
}

function captureFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')!.drawImage(video, 0, 0);
  return canvas;
}

export function DocumentCapture({
  onComplete,
  onCancel,
}: {
  onComplete: (result: DocumentCaptureResult) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const passportShotRef = useRef<HTMLCanvasElement | null>(null);

  const [stage, setStage] = useState<Stage>('starting');
  const [error, setError] = useState<string | null>(null);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<{ isMatch: boolean; distance: number } | null>(null);
  const [modelsReady, setModelsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadModels()
      .then(() => {
        if (!cancelled) setModelsReady(true);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load face verification models');
      });

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStage('passport');
      })
      .catch(() => {
        if (!cancelled) {
          setStage('camera-error');
          setError('Camera access is required for document verification. Please allow camera access and try again.');
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturePassport() {
    if (!videoRef.current) return;
    const canvas = captureFrame(videoRef.current);
    passportShotRef.current = canvas;
    setPassportPreview(canvas.toDataURL('image/jpeg'));
    setStage('face');
  }

  async function captureFace() {
    if (!videoRef.current || !passportShotRef.current) return;
    const faceCanvas = captureFrame(videoRef.current);
    setFacePreview(faceCanvas.toDataURL('image/jpeg'));
    setStage('comparing');
    setError(null);

    try {
      const [passportDescriptor, faceDescriptor] = await Promise.all([
        getFaceDescriptor(passportShotRef.current),
        getFaceDescriptor(faceCanvas),
      ]);
      const result = compareFaces(passportDescriptor, faceDescriptor);
      setMatchResult(result);
      setStage('result');
    } catch (err) {
      if (err instanceof NoFaceDetectedError) {
        setMatchResult({ isMatch: false, distance: 1 });
        setStage('result');
      } else {
        setError('Face comparison failed unexpectedly. Please retry.');
        setStage('result');
        setMatchResult({ isMatch: false, distance: 1 });
      }
    }
  }

  function retake() {
    passportShotRef.current = null;
    setPassportPreview(null);
    setFacePreview(null);
    setMatchResult(null);
    setError(null);
    setStage('passport');
  }

  function finish() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onComplete({
      faceMatchPassed: matchResult?.isMatch ?? false,
      faceMatchScore: matchResult ? matchResult.distance : null,
    });
  }

  function cancel() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  }

  return (
    <div className="document-capture-overlay">
      <div className="document-capture-card">
        <h3>Document &amp; face verification</h3>

        {error && stage === 'camera-error' && <p className="issue-list">{error}</p>}

        <div className="document-capture-video-wrap" style={{ display: stage === 'passport' || stage === 'face' ? 'block' : 'none' }}>
          <video ref={videoRef} autoPlay playsInline muted className="document-capture-video" />
        </div>

        {stage === 'starting' && <p>Starting camera…</p>}

        {stage === 'passport' && (
          <>
            <p>Hold your passport photo page up to the camera, then capture it.</p>
            <button type="button" onClick={capturePassport} disabled={!modelsReady}>
              {modelsReady ? 'Capture passport photo' : 'Loading verification models…'}
            </button>
          </>
        )}

        {stage === 'face' && (
          <>
            {passportPreview && <img src={passportPreview} alt="Captured passport" className="document-capture-thumb" />}
            <p>Now look at the camera to capture a selfie for face matching.</p>
            <button type="button" onClick={captureFace}>
              Capture selfie
            </button>
          </>
        )}

        {stage === 'comparing' && <p>Comparing faces…</p>}

        {stage === 'result' && matchResult && (
          <div>
            <div className="document-capture-previews">
              {passportPreview && <img src={passportPreview} alt="Captured passport" className="document-capture-thumb" />}
              {facePreview && <img src={facePreview} alt="Captured selfie" className="document-capture-thumb" />}
            </div>
            {matchResult.isMatch ? (
              <p className="save-confirm">✓ Face match confirmed</p>
            ) : (
              <p className="issue-list">✗ Face match failed — the selfie doesn't match the passport photo.</p>
            )}
            {error && <p className="issue-list">{error}</p>}
            <button type="button" onClick={finish}>
              {matchResult.isMatch ? 'Continue' : 'Submit as rejected'}
            </button>
            <button type="button" style={{ marginLeft: 8 }} onClick={retake}>
              Retake photos
            </button>
          </div>
        )}

        <button type="button" className="document-capture-cancel" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
