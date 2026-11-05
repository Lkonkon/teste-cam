import { FaceLandmarker, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import "./style.css";
import { createIcons, ScanLine, Images, ShieldCheck, MoreHorizontal, ChevronRight, CircleHelp, Webcam, FlipHorizontal2, Video, ScanFace, Sparkles, ChevronDown, VideoOff, Scan, ArrowDown, Ellipsis, ImagePlus, Expand, Lightbulb, LockKeyhole, X } from "lucide";

createIcons({
  icons: {
    ScanLine, Images, ShieldCheck, MoreHorizontal, ChevronRight, CircleHelp,
    Webcam, FlipHorizontal2, Video, ScanFace, Sparkles, ChevronDown, VideoOff,
    Scan, ArrowDown, Ellipsis, ImagePlus, Expand, Lightbulb, LockKeyhole, X
  }
});

const video = document.querySelector("#camera-video");
const cameraSelect = document.querySelector("#camera-select");
const startButton = document.querySelector("#start-button");
const stopButton = document.querySelector("#stop-button");
const placeholder = document.querySelector("#camera-placeholder");
const cameraHud = document.querySelector("#camera-hud");
const faceOutline = document.querySelector("#face-outline");
const flipButton = document.querySelector("#flip-button");
const sessionLabel = document.querySelector("#session-label");
const cameraLabel = document.querySelector("#camera-label");
const cameraDot = document.querySelector("#camera-dot");
const recognitionMessage = document.querySelector("#recognition-message");
const recognitionIcon = document.querySelector("#recognition-icon");
const gestureToast = document.querySelector("#gesture-toast");
const resultImage = document.querySelector(".result-image");
const modalImage = document.querySelector("#image-modal img");
const imageInput = document.querySelector("#image-input");
const toastMessage = document.querySelector("#toast-message");

let stream = null;
let faceLandmarker = null;
let handLandmarker = null;
let animationFrame = 0;
let mirrored = true;
let lastVideoTime = -1;
let lastGestureAt = 0;
let shushStartedAt = 0;
let gestureShown = false;
let toastTimeout = 0;

const models = {
  face: new URL("./models/face_landmarker.task", window.location.href).toString(),
  hand: new URL("./models/hand_landmarker.task", window.location.href).toString()
};

function setRecognitionState(message, icon = "scan") {
  recognitionMessage.textContent = message;
  recognitionIcon.replaceChildren();
  const element = document.createElement("i");
  element.setAttribute("data-lucide", icon);
  recognitionIcon.append(element);
  createIcons({ icons: { Scan, ShieldCheck, Sparkles, Video }, attrs: { "stroke-width": 1.8 } });
}

function notify(message) {
  toastMessage.textContent = message;
  toastMessage.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toastMessage.classList.add("hidden"), 3200);
}

async function loadModels() {
  if (faceLandmarker && handLandmarker) return;
  setRecognitionState("Preparando reconhecimento local…", "scan");
  const vision = await FilesetResolver.forVisionTasks(new URL("./wasm/", window.location.href).toString());
  [faceLandmarker, handLandmarker] = await Promise.all([
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: models.face, delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false
    }),
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: models.hand, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 2
    })
  ]);
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  const selected = cameraSelect.value;
  cameraSelect.replaceChildren();
  cameras.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Câmera ${index + 1}`;
    cameraSelect.append(option);
  });
  if (selected && cameras.some((device) => device.deviceId === selected)) cameraSelect.value = selected;
  if (!cameras.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nenhuma câmera encontrada";
    cameraSelect.append(option);
  }
}

async function startCamera(deviceId) {
  startButton.disabled = true;
  try {
    await loadModels();
    if (stream) stopTracks();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: deviceId ? undefined : "user"
      }
    });
    video.srcObject = stream;
    await video.play();
    await listCameras();
    const activeDevice = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (activeDevice) cameraSelect.value = activeDevice;
    placeholder.classList.add("hidden");
    cameraHud.classList.remove("hidden");
    faceOutline.classList.add("hidden");
    stopButton.disabled = false;
    cameraLabel.textContent = "CÂMERA AO VIVO";
    cameraDot.classList.add("is-live");
    sessionLabel.textContent = "RECONHECIMENTO ATIVO";
    document.querySelector("#session-indicator").classList.add("is-active");
    setRecognitionState("Procurando uma pessoa…", "scan");
    lastVideoTime = -1;
    animationFrame = requestAnimationFrame(detectFrame);
  } catch (error) {
    stopTracks();
    const message = error.name === "NotAllowedError"
      ? "Permita o acesso à câmera nas configurações do dispositivo."
      : error.name === "NotFoundError"
        ? "Nenhuma webcam foi encontrada neste dispositivo."
        : error.message || "Não foi possível iniciar a câmera.";
    notify(message);
    setRecognitionState("Não foi possível ativar a câmera", "scan");
  } finally {
    startButton.disabled = false;
  }
}

function stopTracks() {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
}

function stopCamera() {
  cancelAnimationFrame(animationFrame);
  stopTracks();
  placeholder.classList.remove("hidden");
  cameraHud.classList.add("hidden");
  faceOutline.classList.add("hidden");
  gestureToast.classList.add("hidden");
  stopButton.disabled = true;
  cameraLabel.textContent = "PRÉ-VISUALIZAÇÃO";
  cameraDot.classList.remove("is-live");
  sessionLabel.textContent = "CÂMERA DESLIGADA";
  document.querySelector("#session-indicator").classList.remove("is-active");
  setRecognitionState("Aguardando ativação da câmera", "scan");
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function detectShush(face, hand) {
  const mouth = {
    x: (face[13].x + face[14].x) / 2,
    y: (face[13].y + face[14].y) / 2
  };
  const indexTip = hand[8];
  const indexPip = hand[6];
  const middleTip = hand[12];
  const ringTip = hand[16];
  const pinkyTip = hand[20];
  const indexExtended = distance(indexTip, hand[0]) > distance(indexPip, hand[0]) * 1.08;
  const fingersFolded = [middleTip, ringTip, pinkyTip].every((tip, index) =>
    distance(tip, hand[0]) < distance([hand[12], hand[16], hand[20]][index], hand[0]) * 1.14
  );
  const nearMouth = distance(indexTip, mouth) < 0.13;
  const upright = indexTip.y < indexPip.y + 0.035;
  return nearMouth && indexExtended && fingersFolded && upright;
}

function detectFrame() {
  if (!stream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    animationFrame = requestAnimationFrame(detectFrame);
    return;
  }
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const faceResult = faceLandmarker.detectForVideo(video, now);
    const handResult = handLandmarker.detectForVideo(video, now);
    const faces = faceResult.faceLandmarks;
    const hands = handResult.landmarks;

    if (faces.length) {
      faceOutline.classList.remove("hidden");
      const faceX = mirrored ? 1 - faces[10].x : faces[10].x;
      faceOutline.style.left = `${Math.max(4, Math.min(75, faceX * 100 - 17))}%`;
      faceOutline.style.top = `${Math.max(8, Math.min(60, faces[10].y * 100 - 12))}%`;
      setRecognitionState("Pessoa detectada · procurando o gesto", "scan");
      const gestureDetected = hands.some((hand) => detectShush(faces[0], hand));
      if (gestureDetected) {
        if (!shushStartedAt) shushStartedAt = now;
        if (!gestureShown && now - shushStartedAt > 250 && now - lastGestureAt > 1800) {
          gestureShown = true;
          lastGestureAt = now;
          gestureToast.classList.remove("hidden");
          setRecognitionState("Gesto de silêncio reconhecido!", "sparkles");
        }
      } else {
        shushStartedAt = 0;
        if (gestureShown) {
          gestureShown = false;
          gestureToast.classList.add("hidden");
        }
      }
    } else {
      faceOutline.classList.add("hidden");
      shushStartedAt = 0;
      gestureShown = false;
      gestureToast.classList.add("hidden");
      setRecognitionState("Posicione o rosto diante da câmera", "scan");
    }
  }
  animationFrame = requestAnimationFrame(detectFrame);
}

startButton.addEventListener("click", () => startCamera(cameraSelect.value));
stopButton.addEventListener("click", stopCamera);

cameraSelect.addEventListener("change", async () => {
  if (stream) await startCamera(cameraSelect.value);
});

flipButton.addEventListener("click", () => {
  mirrored = !mirrored;
  video.classList.toggle("unmirrored", !mirrored);
});

document.querySelector("#reset-button").addEventListener("click", () => {
  shushStartedAt = 0;
  gestureShown = false;
  lastGestureAt = 0;
  gestureToast.classList.add("hidden");
  notify("Gesto redefinido. Pode tentar novamente!");
});

document.querySelector("#change-image").addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    notify("Escolha um arquivo de imagem.");
    return;
  }
  const imageUrl = URL.createObjectURL(file);
  resultImage.src = imageUrl;
  modalImage.src = imageUrl;
  notify("Imagem atualizada para esta sessão.");
});

document.querySelector("#expand-image").addEventListener("click", () => document.querySelector("#image-modal").classList.remove("hidden"));
document.querySelector("#modal-close").addEventListener("click", () => document.querySelector("#image-modal").classList.add("hidden"));
document.querySelector("#image-modal").addEventListener("click", (event) => {
  if (event.target.id === "image-modal") event.currentTarget.classList.add("hidden");
});
document.querySelector("#gesture-shortcut").addEventListener("click", () => {
  document.querySelector(".gesture-visual").scrollIntoView({ behavior: "smooth", block: "center" });
});
document.querySelector("#gallery-nav").addEventListener("click", () => notify("A galeria de imagens estará disponível em breve."));
document.querySelector("#help-button").addEventListener("click", () => notify("A câmera detecta rostos e o gesto do silêncio sem identificar quem você é."));
document.querySelector("#image-info").addEventListener("click", () => notify("Esta imagem aparece quando o gesto do silêncio é reconhecido."));
document.querySelector("#image-modal").addEventListener("keydown", (event) => {
  if (event.key === "Escape") event.currentTarget.classList.add("hidden");
});

if (navigator.mediaDevices?.enumerateDevices) {
  listCameras().catch((error) => notify(`Não foi possível listar as câmeras: ${error.message}`));
  navigator.mediaDevices.addEventListener?.("devicechange", () =>
    listCameras().catch((error) => notify(`Não foi possível atualizar as câmeras: ${error.message}`))
  );
} else {
  notify("Este dispositivo não oferece suporte à captura de câmera.");
}

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
  stopTracks();
  faceLandmarker?.close();
  handLandmarker?.close();
});
