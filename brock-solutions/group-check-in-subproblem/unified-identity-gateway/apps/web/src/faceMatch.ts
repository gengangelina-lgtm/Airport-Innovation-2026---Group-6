import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';
const MATCH_THRESHOLD = 0.6;

let modelsLoaded: Promise<void> | null = null;

export function loadModels(): Promise<void> {
  if (!modelsLoaded) {
    modelsLoaded = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => undefined);
  }
  return modelsLoaded;
}

export class NoFaceDetectedError extends Error {
  constructor() {
    super('no_face_detected');
  }
}

export async function getFaceDescriptor(image: HTMLCanvasElement): Promise<Float32Array> {
  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) throw new NoFaceDetectedError();
  return detection.descriptor;
}

export interface FaceCompareResult {
  isMatch: boolean;
  distance: number;
}

export function compareFaces(a: Float32Array, b: Float32Array): FaceCompareResult {
  const distance = faceapi.euclideanDistance(a, b);
  return { isMatch: distance < MATCH_THRESHOLD, distance };
}
