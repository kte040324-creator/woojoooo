import './style.css'
import * as THREE from 'three'
import { FilesetResolver, PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'

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

function makeStarSpriteTexture() {
  const size = 64
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return new THREE.Texture()

  ctx.clearRect(0, 0, size, size)

  const cx = size * 0.5
  const cy = size * 0.5
  const r = size * 0.45

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

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
  sprite: THREE.Texture
}) {
  const { count, radiusMin, radiusMax, size, color1, color2, opacity, sprite } = opts

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
    map: sprite,
    alphaMap: sprite,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.02,
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

// 3D 축(X,Y,Z) 방향 격자선 — 별 공간을 축으로 잇는 선
function makeAxisGrid(opts: { size: number; steps: number; color: number; opacity: number }) {
  const { size, steps, color, opacity } = opts
  const positions: number[] = []
  const half = size / 2
  const step = size / (steps + 1)
  for (let i = 1; i <= steps; i++) {
    const v = -half + step * i
    for (let j = 1; j <= steps; j++) {
      const w = -half + step * j
      positions.push(-half, v, w, half, v, w)
      positions.push(v, -half, w, v, half, w)
      positions.push(v, w, -half, v, w, half)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeBoundingSphere()
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  })
  const grid = new THREE.LineSegments(geo, mat)
  grid.frustumCulled = false
  return grid
}

function captureBasePositions(points: THREE.Points) {
  const geo = points.geometry as THREE.BufferGeometry
  const attr = geo.getAttribute('position') as THREE.BufferAttribute
  const base = new Float32Array((attr.array as Float32Array).length)
  base.set(attr.array as Float32Array)
  points.frustumCulled = false
  return { attr, base }
}

function convergePointsDual(
  attr: THREE.BufferAttribute,
  base: Float32Array,
  leftTarget: THREE.Vector3,
  rightTarget: THREE.Vector3,
  amount: number,
  strength: number
) {
  const arr = attr.array as Float32Array
  const k = clamp01(amount) * strength
  const lx = leftTarget.x
  const ly = leftTarget.y
  const lz = leftTarget.z
  const rx = rightTarget.x
  const ry = rightTarget.y
  const rz = rightTarget.z

  for (let i = 0; i < arr.length; i += 3) {
    const bx = base[i]
    const by = base[i + 1]
    const bz = base[i + 2]
    const wR = smoothstep(-4, 4, bx)
    const wL = 1 - wR
    const tx = wL * lx + wR * rx
    const ty = wL * ly + wR * ry
    const tz = wL * lz + wR * rz
    const inv = 1 - k
    arr[i] = tx + (bx - tx) * inv
    arr[i + 1] = ty + (by - ty) * inv
    arr[i + 2] = tz + (bz - tz) * inv
  }
  attr.needsUpdate = true
}

const stage = document.querySelector<HTMLDivElement>('#stage')
const camFrontEl = document.querySelector<HTMLVideoElement>('#cam-front')
const camLeftEl = document.querySelector<HTMLVideoElement>('#cam-left')
const camRightEl = document.querySelector<HTMLVideoElement>('#cam-right')
const handDebugEl = document.querySelector<HTMLCanvasElement>('#hand-debug')
if (!stage || !camFrontEl || !camLeftEl || !camRightEl) {
  throw new Error('Missing stage or camera video elements')
}

const HAND_DEBUG_W = 1000
const HAND_DEBUG_H = 720
let handDebugCtx: CanvasRenderingContext2D | null = null
let lastHandLandmarks: { label: string; landmarks: { x: number; y: number }[] }[] = []

// 손가락 끝만 숫자 영역으로 표시 (4=엄지, 8=검지, 12=중지, 16=약지, 20=새끼)
const FINGER_TIP_INDICES = [4, 8, 12, 16, 20]

if (handDebugEl) {
  handDebugEl.width = HAND_DEBUG_W
  handDebugEl.height = HAND_DEBUG_H
  handDebugCtx = handDebugEl.getContext('2d')
}

const camFront = camFrontEl
const camLeft = camLeftEl
const camRight = camRightEl

const video = camFront

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

async function setupSideCam(video: HTMLVideoElement) {
  try {
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
  } catch {
    // ignore side camera errors – main interaction uses front cam
  }
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

async function setupHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  )

  return await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6
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

const starSprite = makeStarSpriteTexture()

const starLayerFar = makeStarField({
  count: 8500,
  radiusMin: 45,
  radiusMax: 140,
  size: 0.05,
  color1: new THREE.Color('#8aa0ff'),
  color2: new THREE.Color('#fff3df'),
  opacity: 0.9,
  sprite: starSprite
})

const starLayerMid = makeStarField({
  count: 2200,
  radiusMin: 18,
  radiusMax: 70,
  size: 0.07,
  color1: new THREE.Color('#7bd5ff'),
  color2: new THREE.Color('#ffe4bf'),
  opacity: 0.85,
  sprite: starSprite
})

const starLayerNear = makeStarField({
  count: 750,
  radiusMin: 6,
  radiusMax: 26,
  size: 0.11,
  color1: new THREE.Color('#ffffff'),
  color2: new THREE.Color('#b7c7ff'),
  opacity: 0.75,
  sprite: starSprite
})

const galaxyBand = makeGalaxyBand(5200)

const axisGrid = makeAxisGrid({
  size: 160,
  steps: 6,
  color: 0x88aaff,
  opacity: 0.18
})
scene.add(axisGrid)

// 0..n-1 랜덤 치환
function randomPermutation(n: number): number[] {
  const p: number[] = []
  for (let i = 0; i < n; i++) p[i] = i
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  return p
}

// 같은 레이어 안에서 position끼리만 랜덤으로 섞기 (attr와 base 동일 순서로)
function shuffleStarPositions(attr: THREE.BufferAttribute, base: Float32Array) {
  const arr = attr.array as Float32Array
  const n = arr.length / 3
  const perm = randomPermutation(n)
  const copyPos = new Float32Array(arr)
  const copyBase = new Float32Array(base)
  for (let i = 0; i < n; i++) {
    const j = perm[i] * 3
    const i3 = i * 3
    arr[i3] = copyPos[j]
    arr[i3 + 1] = copyPos[j + 1]
    arr[i3 + 2] = copyPos[j + 2]
    base[i3] = copyBase[j]
    base[i3 + 1] = copyBase[j + 1]
    base[i3 + 2] = copyBase[j + 2]
  }
  attr.needsUpdate = true
}

let lastTipPositions: { x: number; y: number }[] = []
const FINGER_TIP_MOVE_THRESHOLD = 0.003
const CONSTELLATION_COOLDOWN = 0.2
let lastConstellationChangeTime = 0

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
let handLandmarker: HandLandmarker | null = null
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
let convergeTarget = 0
let convergeAmount = 0

const tmpNdc = new THREE.Vector3()
const tmpDir = new THREE.Vector3()

// 왼손/오른손 손바닥 한 점 → 각각 왼쪽/오른쪽 별 구역 끌림 (유영)
let lastLeftHand01 = { x: 0.25, y: 0.5 }
let lastRightHand01 = { x: 0.75, y: 0.5 }
let bothHandsVisible = false
const leftTargetWorld = new THREE.Vector3()
const rightTargetWorld = new THREE.Vector3()

function handNormalizedToWorld(x01: number, y01: number, out: THREE.Vector3) {
  const ndcX = (1 - x01) * 2 - 1
  const ndcY = -(y01 * 2 - 1)
  tmpNdc.set(ndcX, ndcY, 0.55)
  tmpNdc.unproject(camera)
  tmpDir.copy(tmpNdc).sub(camera.position).normalize()
  out.copy(camera.position).addScaledVector(tmpDir, 10)
}

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

  // 좌우/위아래 반대로 보이도록 (고개 돌리는 방향과 시선 방향 자연스럽게)
  targetYaw = -sx * MAX_YAW
  targetPitch = -sy * MAX_PITCH
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

  if ((poseLandmarker || handLandmarker) && video.readyState >= 2) {
    const now = performance.now()
    const vt = video.currentTime
    if (vt !== lastVideoTime) {
      lastVideoTime = vt
      if (poseLandmarker) {
        const resPose = poseLandmarker.detectForVideo(video, now)
        const lmPose = resPose.landmarks?.[0]
        if (lmPose && lmPose.length >= 33) {
          havePose = true
          updateCameraFromPose(lmPose)
          updateConvergeFromPose(lmPose)
        } else {
          havePose = false
          convergeTarget = 0
        }
      }

      if (handLandmarker) {
        const resHand = handLandmarker.detectForVideo(video, now)
        const lmHands = resHand.landmarks ?? []
        const handed = resHand.handedness ?? []
        lastHandLandmarks = []
        for (let h = 0; h < lmHands.length; h++) {
          const lm = lmHands[h]
          if (!lm || lm.length < 21) continue
          const label = handed[h]?.[0]?.categoryName ?? '?'
          lastHandLandmarks.push({
            label,
            landmarks: lm.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }))
          })
          const palmX = (lm[0].x + lm[5].x + lm[9].x) / 3
          const palmY = (lm[0].y + lm[5].y + lm[9].y) / 3
          if (label === 'Left') {
            lastLeftHand01 = { x: palmX, y: palmY }
          } else if (label === 'Right') {
            lastRightHand01 = { x: palmX, y: palmY }
          }
        }
      }
    }
  }
  bothHandsVisible =
    lastHandLandmarks.some((h) => h.label === 'Left') &&
    lastHandLandmarks.some((h) => h.label === 'Right')

  // 손가락 위치를 섞을 때마다 → 지금 보이는 별들끼리 position만 랜덤으로 섞기 (레이어 추가 없음)
  if (bothHandsVisible) {
    const leftHand = lastHandLandmarks.find((h) => h.label === 'Left')
    const rightHand = lastHandLandmarks.find((h) => h.label === 'Right')
    const currentTips: { x: number; y: number }[] = []
    if (leftHand?.landmarks && leftHand.landmarks.length >= 21) {
      for (const i of FINGER_TIP_INDICES) currentTips.push({ x: leftHand.landmarks[i].x, y: leftHand.landmarks[i].y })
    }
    if (rightHand?.landmarks && rightHand.landmarks.length >= 21) {
      for (const i of FINGER_TIP_INDICES) currentTips.push({ x: rightHand.landmarks[i].x, y: rightHand.landmarks[i].y })
    }
    let shouldShuffle = false
    const now = performance.now() / 1000
    if (currentTips.length === 10 && lastTipPositions.length === 10) {
      let moveSum = 0
      for (let i = 0; i < 10; i++) {
        const dx = currentTips[i].x - lastTipPositions[i].x
        const dy = currentTips[i].y - lastTipPositions[i].y
        moveSum += dx * dx + dy * dy
      }
      if (moveSum > FINGER_TIP_MOVE_THRESHOLD && now - lastConstellationChangeTime >= CONSTELLATION_COOLDOWN) shouldShuffle = true
    } else if (currentTips.length === 10) {
      shouldShuffle = true
    }
    if (shouldShuffle && currentTips.length === 10) {
      lastConstellationChangeTime = now
      lastTipPositions = currentTips.map((t) => ({ x: t.x, y: t.y }))
      shuffleStarPositions(farCap.attr, farCap.base)
      shuffleStarPositions(midCap.attr, midCap.base)
      shuffleStarPositions(nearCap.attr, nearCap.base)
      shuffleStarPositions(bandCap.attr, bandCap.base)
    }
  } else {
    lastTipPositions = []
  }

  if (handDebugCtx) {
    handDebugCtx.clearRect(0, 0, HAND_DEBUG_W, HAND_DEBUG_H)
    handDebugCtx.font = '12px monospace'
    handDebugCtx.textBaseline = 'middle'
    handDebugCtx.textAlign = 'center'
    handDebugCtx.lineCap = 'round'
    handDebugCtx.lineJoin = 'round'
    handDebugCtx.strokeStyle = 'rgba(255,255,255,0.7)'
    handDebugCtx.lineWidth = 1.2 / 5
    const toX = (x: number) => (1 - x) * HAND_DEBUG_W
    const toY = (y: number) => y * HAND_DEBUG_H
    const handsByLabel: { Left?: { x: number; y: number; i: number }[]; Right?: { x: number; y: number; i: number }[] } = {}
    for (const hand of lastHandLandmarks) {
      const lm = hand.landmarks
      if (lm.length < 21) continue
      const tips = FINGER_TIP_INDICES.map((i) => ({ x: toX(lm[i].x), y: toY(lm[i].y), i }))
      handsByLabel[hand.label as 'Left' | 'Right'] = tips
      // tip끼리만 연결: 엄지→검지→중지→약지→새끼→엄지 (손 윤곽)
      const order = [0, 1, 2, 3, 4, 0]
      for (let k = 0; k < order.length - 1; k++) {
        const a = tips[order[k]]
        const b = tips[order[k + 1]]
        const cpx = (a.x + b.x) * 0.5 + (b.y - a.y) * 0.08
        const cpy = (a.y + b.y) * 0.5 - (b.x - a.x) * 0.08
        handDebugCtx.beginPath()
        handDebugCtx.moveTo(a.x, a.y)
        handDebugCtx.quadraticCurveTo(cpx, cpy, b.x, b.y)
        handDebugCtx.stroke()
      }
      for (const t of tips) {
        handDebugCtx.fillStyle = '#fff'
        handDebugCtx.fillText(String(t.i), t.x, t.y)
      }
    }
    // 좌-우 같은 tip끼리 연결 (엄지-엄지, 검지-검지, ...)
    const leftTips = handsByLabel.Left
    const rightTips = handsByLabel.Right
    if (leftTips && rightTips) {
      for (let k = 0; k < 5; k++) {
        const a = leftTips[k]
        const b = rightTips[k]
        const cpx = (a.x + b.x) * 0.5 + (b.y - a.y) * 0.06
        const cpy = (a.y + b.y) * 0.5 - (b.x - a.x) * 0.06
        handDebugCtx.beginPath()
        handDebugCtx.moveTo(a.x, a.y)
        handDebugCtx.quadraticCurveTo(cpx, cpy, b.x, b.y)
        handDebugCtx.stroke()
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

  handNormalizedToWorld(lastLeftHand01.x, lastLeftHand01.y, leftTargetWorld)
  handNormalizedToWorld(lastRightHand01.x, lastRightHand01.y, rightTargetWorld)
  const amt = havePose ? convergeAmount : 0.15
  convergePointsDual(farCap.attr, farCap.base, leftTargetWorld, rightTargetWorld, amt, 0.35)
  convergePointsDual(midCap.attr, midCap.base, leftTargetWorld, rightTargetWorld, amt, 0.55)
  convergePointsDual(nearCap.attr, nearCap.base, leftTargetWorld, rightTargetWorld, amt, 0.75)
  convergePointsDual(bandCap.attr, bandCap.base, leftTargetWorld, rightTargetWorld, amt, 0.18)

  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

async function main() {
  setStatus('webcam…')
  await setupWebcam(video)
  await Promise.all([setupSideCam(camLeft), setupSideCam(camRight)])
  setStatus('mediapipe…')
  poseLandmarker = await setupPoseLandmarker()
  handLandmarker = await setupHandLandmarker()
  setStatus('space ready')
  tick()
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  setStatus(`error: ${msg}`)
  // eslint-disable-next-line no-console
  console.error(err)
})
