declare module 'canvas-confetti' {
  interface ConfettiOptions {
    particleCount?: number
    angle?: number
    spread?: number
    startVelocity?: number
    decay?: number
    gravity?: number
    drift?: number
    scalar?: number
    shapes?: ('square' | 'circle')[]
    zIndex?: number
    disableForReducedMotion?: boolean
    useWorker?: boolean
    resize?: boolean
    canvas?: HTMLCanvasElement
    origin?: { x: number; y: number }
    colors?: string[]
    ticks?: number
  }

  interface ConfettiInstance {
    (options?: ConfettiOptions): void
  }

  const confetti: ConfettiInstance
  export default confetti
}
