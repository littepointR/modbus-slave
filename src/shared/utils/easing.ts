export type EasingFunction = (t: number) => number

export interface EasingPreset {
  name: string
  fn: EasingFunction
  category: string
}

export const linear = (t: number): number => t

export const easeInQuad = (t: number): number => t * t
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t)
export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

export const easeInCubic = (t: number): number => t * t * t
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export const easeInQuart = (t: number): number => t * t * t * t
export const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4)
export const easeInOutQuart = (t: number): number =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2

export const easeInQuint = (t: number): number => t * t * t * t * t
export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5)
export const easeInOutQuint = (t: number): number =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2

export const easeInSine = (t: number): number => 1 - Math.cos((t * Math.PI) / 2)
export const easeOutSine = (t: number): number => Math.sin((t * Math.PI) / 2)
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2

export const easeInCirc = (t: number): number => 1 - Math.sqrt(1 - Math.pow(t, 2))
export const easeOutCirc = (t: number): number => Math.sqrt(1 - Math.pow(t - 1, 2))
export const easeInOutCirc = (t: number): number =>
  t < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2

export const easeInExpo = (t: number): number => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1)))
export const easeOutExpo = (t: number): number => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeInOutExpo = (t: number): number => {
  if (t === 0) return 0
  if (t === 1) return 1
  return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2
}

export const easeInElastic = (t: number): number => {
  const c4 = (2 * Math.PI) / 3
  if (t === 0) return 0
  if (t === 1) return 1
  return -Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1.1) * 10 * c4) / 0.4)
}

export const easeOutElastic = (t: number): number => {
  const c4 = (2 * Math.PI) / 3
  if (t === 0) return 0
  if (t === 1) return 1
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

export const easeInOutElastic = (t: number): number => {
  const c5 = (2 * Math.PI) / 4.5
  if (t === 0) return 0
  if (t === 1) return 1
  return t < 0.5
    ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
    : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1
}

export const easeInBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return c3 * t * t * t - c1 * t * t
}

export const easeOutBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export const easeInOutBack = (t: number): number => {
  const c1 = 1.70158
  const c2 = c1 * 1.525
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2
}

export const easeInBounce = (t: number): number => 1 - easeOutBounce(1 - t)

export const easeOutBounce = (t: number): number => {
  const n1 = 7.5625
  const d1 = 2.75

  if (t < 1 / d1) {
    return n1 * t * t
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375
  }
}

export const easeInOutBounce = (t: number): number =>
  t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2

export const easings: EasingPreset[] = [
  { name: 'linear', fn: linear, category: 'Linear' },

  { name: 'easeInQuad', fn: easeInQuad, category: 'Quadratic' },
  { name: 'easeOutQuad', fn: easeOutQuad, category: 'Quadratic' },
  { name: 'easeInOutQuad', fn: easeInOutQuad, category: 'Quadratic' },

  { name: 'easeInCubic', fn: easeInCubic, category: 'Cubic' },
  { name: 'easeOutCubic', fn: easeOutCubic, category: 'Cubic' },
  { name: 'easeInOutCubic', fn: easeInOutCubic, category: 'Cubic' },

  { name: 'easeInQuart', fn: easeInQuart, category: 'Quartic' },
  { name: 'easeOutQuart', fn: easeOutQuart, category: 'Quartic' },
  { name: 'easeInOutQuart', fn: easeInOutQuart, category: 'Quartic' },

  { name: 'easeInQuint', fn: easeInQuint, category: 'Quintic' },
  { name: 'easeOutQuint', fn: easeOutQuint, category: 'Quintic' },
  { name: 'easeInOutQuint', fn: easeInOutQuint, category: 'Quintic' },

  { name: 'easeInSine', fn: easeInSine, category: 'Sine' },
  { name: 'easeOutSine', fn: easeOutSine, category: 'Sine' },
  { name: 'easeInOutSine', fn: easeInOutSine, category: 'Sine' },

  { name: 'easeInCirc', fn: easeInCirc, category: 'Circular' },
  { name: 'easeOutCirc', fn: easeOutCirc, category: 'Circular' },
  { name: 'easeInOutCirc', fn: easeInOutCirc, category: 'Circular' },

  { name: 'easeInExpo', fn: easeInExpo, category: 'Exponential' },
  { name: 'easeOutExpo', fn: easeOutExpo, category: 'Exponential' },
  { name: 'easeInOutExpo', fn: easeInOutExpo, category: 'Exponential' },

  { name: 'easeInElastic', fn: easeInElastic, category: 'Elastic' },
  { name: 'easeOutElastic', fn: easeOutElastic, category: 'Elastic' },
  { name: 'easeInOutElastic', fn: easeInOutElastic, category: 'Elastic' },

  { name: 'easeInBack', fn: easeInBack, category: 'Back' },
  { name: 'easeOutBack', fn: easeOutBack, category: 'Back' },
  { name: 'easeInOutBack', fn: easeInOutBack, category: 'Back' },

  { name: 'easeInBounce', fn: easeInBounce, category: 'Bounce' },
  { name: 'easeOutBounce', fn: easeOutBounce, category: 'Bounce' },
  { name: 'easeInOutBounce', fn: easeInOutBounce, category: 'Bounce' }
]

export function getEasingByName(name: string): EasingFunction | undefined {
  const preset = easings.find((e) => e.name === name)
  return preset?.fn
}

export function getEasingsByCategory(category: string): EasingPreset[] {
  return easings.filter((e) => e.category === category)
}

export const easingCategories = Array.from(new Set(easings.map((e) => e.category)))
