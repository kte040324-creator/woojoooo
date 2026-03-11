import './style.css'
import * as THREE from 'three'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const STAGE_WIDTH = 3000
const STAGE_HEIGHT = 720

function setStatus(text: string) {
  const el = document.querySelector<HTMLDivElement>('#status')
  if (el) el.textContent = text
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function makeNebulaTexture(colorA: string, colorB: string) {
  const size = 256
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return new THREE.Texture()

  ctx.clearRect(0, 0, size, size)

  const g = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5)
  g.addColorStop(0.0, colorA)
  g.addColorStop(0.45, colorB)
  g.addColorStop(1.0, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // 작은 노이즈 점들
  const dots = 2200
  for (let i = 0; i < dots; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = Math.random() * 1.2
    const a = Math.random() * 0.06
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearMipMapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

function makeStarField(opts: {
  count: number
  radiusMin: number
  radiusMax: number
  size: number
  color1: THREE.Color
  color2: THREE.Color
  opacity: number
}) {
  const { count, radiusMin, radiusMax, size, color1, color2, opacity } = opts

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = rand(radiusMin, radiusMax)

    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.cos(phi)
    const z = r * Math.sin(phi) * Math.sin(theta)

    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    const t = Math.pow(Math.random(), 1.7)
    c.copy(color1).lerp(color2, t)
    const boost = rand(0.8, 1.25)
    colors[i * 3] = c.r * boost
    colors[i * 3 + 1] = c.g * boost
    colors[i * 3 + 2] = c.b * boost
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  })

  const points = new THREE.Points(geo, mat)
  return points
}

function makeGalaxyBand(count: number) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  const c1 = new THREE.Color('#9fb7ff')
  const c2 = new THREE.Color('#ffd7a6')
  const c = new THREE.Color()

  for (let i = 0; i < count; i++) {
    const t = Math.random() * 2 - 1
    const x = t * 28
    const y = rand(-1.2, 1.2) + Math.sin(t * 2.2) * 0.55
    const z = rand(-5.5, 5.5)

    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    const k = smoothstep(0, 1, 1 - Math.abs(t))
    c.copy(c1).lerp(c2, Math.pow(k, 2.4) * 0.55)
    const boost = 0.55 + k * 1.15
    colors[i * 3] = c.r * boost
    colors[i * 3 + 1] = c.g * boost
    colors[i * 3 + 2] = c.b * boost
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({
    size: 0.06,
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })

  const band = new THREE.Points(geo, mat)
  band.rotation.z = -0.08
  band.rotation.x = 0.08
  return band
}

function captureBasePositions(points: THREE.Points) {
  const geo = points.geometry as THREE.BufferGeometry
  const attr = geo.getAttribute('position') as THREE.BufferAttribute
  const base = new Float32Array((attr.array as Float32Array).length)
  base.set(attr.array as Float32Array)
  points.frustumCulled = false
  return { attr, base }
}

function convergePoints(
  attr: THREE.BufferAttribute,
  base: Float32Array,
  target: THREE.Vector3,
  amount: number,
  strength: number
) {
  const arr = attr.array as Float32Array
  const k = clamp01(amount) * strength
  const tx = target.x
  const ty = target.y
  const tz = target.z

  const inv = 1 - k
  for (let i = 0; i < arr.length; i += 3) {
    const bx = base[i]
    const by = base[i + 1]
    const bz = base[i + 2]
    arr[i] = tx + (bx - tx) * inv
    arr[i + 1] = ty + (by - ty) * inv
    arr[i + 2] = tz + (bz - tz) * inv
  }
  attr.needsUpdate = true
}

const stage = document.querySelector<HTMLDivElement>('#stage')
const videoEl = document.querySelector<HTMLVideoElement>('#webcam')
if (!stage || !videoEl) throw new Error('Missing #stage or #webcam element')

const video = videoEl

async function setupWebcam(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 320, max: 480 },
      height: { ideal: 240, max: 270 }
    }
  })
  video.srcObject = stream
  await video.play()
}

async function setupPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  )

  return await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  })
}

// --- three.js ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000007)
scene.fog = new THREE.FogExp2(0x000007, 0.03)

const camera = new THREE.PerspectiveCamera(55, STAGE_WIDTH / STAGE_HEIGHT, 0.01, 200)
camera.position.set(0, 0, 12)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
renderer.setSize(STAGE_WIDTH, STAGE_HEIGHT, false)
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.setClearColor(0x000007, 1)
stage.appendChild(renderer.domElement)

const starLayerFar = makeStarField({
  count: 9000,
  radiusMin: 22,
  radiusMax: 95,
  size: 0.05,
  color1: new THREE.Color('#8aa0ff'),
  color2: new THREE.Color('#fff3df'),
  opacity: 0.9
})

const starLayerMid = makeStarField({
  count: 2600,
  radiusMin: 10,
  radiusMax: 38,
  size: 0.07,
  color1: new THREE.Color('#7bd5ff'),
  color2: new THREE.Color('#ffe4bf'),
  opacity: 0.85
})

const starLayerNear = makeStarField({
  count: 900,
  radiusMin: 4,
  radiusMax: 14,
  size: 0.11,
  color1: new THREE.Color('#ffffff'),
  color2: new THREE.Color('#b7c7ff'),
  opacity: 0.75
})

const galaxyBand = makeGalaxyBand(5200)

scene.add(starLayerFar, starLayerMid, starLayerNear, galaxyBand)

const farCap = captureBasePositions(starLayerFar)
const midCap = captureBasePositions(starLayerMid)
const nearCap = captureBasePositions(starLayerNear)
const bandCap = captureBasePositions(galaxyBand)

const nebulaGroup = new THREE.Group()
scene.add(nebulaGroup)

const nebulaTexA = makeNebulaTexture('rgba(130,155,255,0.24)', 'rgba(80,120,255,0.08)')
const nebulaTexB = makeNebulaTexture('rgba(255,190,140,0.18)', 'rgba(255,120,200,0.06)')
const nebulaTexC = makeNebulaTexture('rgba(120,255,210,0.14)', 'rgba(60,160,255,0.06)')

const nebulaTextures = [nebulaTexA, nebulaTexB, nebulaTexC]
for (let i = 0; i < 7; i++) {
  const tex = nebulaTextures[i % nebulaTextures.length]
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: 0xffffff,
    transparent: true,
    opacity: rand(0.16, 0.32),
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  const s = new THREE.Sprite(mat)
  s.position.set(rand(-10, 10), rand(-3.4, 3.4), rand(-14, -2))
  const sc = rand(7, 16)
  s.scale.set(sc * 2.1, sc, 1)
  s.material.rotation = rand(0, Math.PI * 2)
  nebulaGroup.add(s)
}

const clock = new THREE.Clock()

let poseLandmarker: PoseLandmarker | null = null
let lastVideoTime = -1

let yaw = 0
let pitch = 0
let targetYaw = 0
let targetPitch = 0

// 얼굴 돌림에 따른 둘러보기 각도 (라디안). 넓게 잡아서 고개만 돌려도 다양한 시점
const MAX_YAW = 2.2
const MAX_PITCH = 0.85
const CAM_RADIUS = 12
const CAM_DAMPING = 0.06

// arms together (wrists close) → star converge; arms spread → star spread
const WRIST_DIST_CLOSED = 0.08
const WRIST_DIST_OPEN = 0.45
const CONVERGE_DAMPING = 0.08

let havePose = false
let poseX01 = 0.5
let poseY01 = 0.5
let convergeTarget = 0
let convergeAmount = 0

const tmpNdc = new THREE.Vector3()
const tmpDir = new THREE.Vector3()
const attractPoint = new THREE.Vector3()

// 코(0) + 귀(7,8)로 머리 방향 추정 → 카메라 yaw/pitch. 얼굴을 돌리면 다른 각도의 화면을 둘러봄
function updateCameraFromPose(landmarks: { x: number; y: number }[]) {
  const nose = landmarks[0]
  const earL = landmarks.length > 8 ? landmarks[7] : null
  const earR = landmarks.length > 9 ? landmarks[8] : null

  let headCenterX = 0.5
  if (earL && earR && earL.x > 0 && earR.x > 0 && earL.x < 1 && earR.x < 1) {
    headCenterX = (earL.x + earR.x) * 0.5
  }

  // 코가 머리 중심에서 얼마나 치우쳤는지 → 얼굴이 돌아간 방향 (화면 기준 좌우 반전)
  const noseOffsetX = (1 - nose.x) - (1 - headCenterX)
  const noseOffsetY = nose.y - 0.5

  // 부드러운 곡선으로 매핑 (중앙은 0, 끝으로 갈수록 ±1)
  const curve = (u: number) => Math.sign(u) * (1 - Math.exp(-Math.abs(u) * 2.2))
  const sx = curve(Math.max(-1, Math.min(1, noseOffsetX * 4)))
  const sy = curve(Math.max(-1, Math.min(1, -noseOffsetY * 2.2)))

  targetYaw = sx * MAX_YAW
  targetPitch = sy * MAX_PITCH
}

function updateConvergeFromPose(landmarks: { x: number; y: number }[]) {
  // Pose: 15 = left_wrist, 16 = right_wrist. 거리 작을수록(팔 모음) converge ↑
  if (landmarks.length < 17) return
  const lw = landmarks[15]
  const rw = landmarks[16]
  const dx = lw.x - rw.x
  const dy = lw.y - rw.y
  const wristDist = Math.sqrt(dx * dx + dy * dy)
  convergeTarget = clamp01((WRIST_DIST_OPEN - wristDist) / (WRIST_DIST_OPEN - WRIST_DIST_CLOSED))
}

function computeAttractPointFromPose() {
  const ndcX = (1 - poseX01) * 2 - 1
  const ndcY = -(poseY01 * 2 - 1)
  tmpNdc.set(ndcX, ndcY, 0.55)
  tmpNdc.unproject(camera)
  tmpDir.copy(tmpNdc).sub(camera.position).normalize()
  attractPoint.copy(camera.position).addScaledVector(tmpDir, 10)
}

function tick() {
  const t = clock.getElapsedTime()

  starLayerFar.rotation.y = t * 0.015
  starLayerFar.rotation.x = 0.12 + Math.sin(t * 0.08) * 0.03

  starLayerMid.rotation.y = -t * 0.028
  starLayerMid.rotation.x = -0.06 + Math.sin(t * 0.11) * 0.02

  starLayerNear.rotation.y = t * 0.045
  starLayerNear.rotation.x = 0.02 + Math.sin(t * 0.15) * 0.02

  galaxyBand.rotation.y = t * 0.01
  nebulaGroup.rotation.y = -t * 0.006

  if (poseLandmarker && video.readyState >= 2) {
    const now = performance.now()
    const vt = video.currentTime
    if (vt !== lastVideoTime) {
      lastVideoTime = vt
      const res = poseLandmarker.detectForVideo(video, now)
      const lm = res.landmarks?.[0]
      if (lm && lm.length >= 33) {
        havePose = true
        poseX01 = lm[0].x
        poseY01 = lm[0].y
        updateCameraFromPose(lm)
        updateConvergeFromPose(lm)
        setStatus('pose ✓  space')
      } else {
        havePose = false
        convergeTarget = 0
        setStatus('pose –  space')
      }
    }
  }

  yaw += (targetYaw - yaw) * CAM_DAMPING
  pitch += (targetPitch - pitch) * CAM_DAMPING

  convergeAmount += (convergeTarget - convergeAmount) * CONVERGE_DAMPING

  const idleGain = havePose ? 0 : 0.04
  const idleX = Math.sin(t * 0.12) * idleGain
  const idleY = Math.cos(t * 0.11) * idleGain
  const y2 = yaw + idleX
  const p2 = pitch + idleY

  // Three.js: 구면 좌표로 원점 둘러보기 — 얼굴 각도에 따라 다른 화면
  camera.position.x = Math.sin(y2) * Math.cos(p2) * CAM_RADIUS
  camera.position.y = Math.sin(p2) * CAM_RADIUS
  camera.position.z = Math.cos(y2) * Math.cos(p2) * CAM_RADIUS
  camera.lookAt(0, 0, 0)

  computeAttractPointFromPose()
  const amt = havePose ? convergeAmount : 0
  convergePoints(farCap.attr, farCap.base, attractPoint, amt, 0.35)
  convergePoints(midCap.attr, midCap.base, attractPoint, amt, 0.55)
  convergePoints(nearCap.attr, nearCap.base, attractPoint, amt, 0.75)
  convergePoints(bandCap.attr, bandCap.base, attractPoint, amt, 0.18)

  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

async function main() {
  setStatus('webcam…')
  await setupWebcam(video)
  setStatus('mediapipe…')
  poseLandmarker = await setupPoseLandmarker()
  setStatus('space ready')
  tick()
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  setStatus(`error: ${msg}`)
  // eslint-disable-next-line no-console
  console.error(err)
})
