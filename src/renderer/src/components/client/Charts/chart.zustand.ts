import { create } from 'zustand'
import { ChartZustand, ChartConfig, CHART_COLORS } from './chart.types'
import { mutative } from 'zustand-mutative'
import { onEvent } from '@renderer/events'
import type { RegisterData, BaseDataType } from '@shared'

const DEFAULT_MAX_POINTS = 1000

const DEFAULT_CONFIG: ChartConfig = {
  enabled: false,
  maxDataPoints: DEFAULT_MAX_POINTS,
  updateInterval: 100,
  series: []
}

const NUMERIC_DATA_TYPES: BaseDataType[] = [
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float',
  'double'
]

function getNumericValue(register: RegisterData, dataType: BaseDataType): number | null {
  if (!register.words) return null
  
  const value = register.words[dataType]
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  return null
}

export const useChartZustand = create<ChartZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    config: { ...DEFAULT_CONFIG },

    setConfig: (config) =>
      set((state) => {
        Object.assign(state.config, config)
      }),

    toggleChart: () =>
      set((state) => {
        state.config.enabled = !state.config.enabled
      }),

    addSeries: (series) =>
      set((state) => {
        const existingIndex = state.config.series.findIndex((s) => s.address === series.address)
        if (existingIndex === -1) {
          const colorIndex = state.config.series.length % CHART_COLORS.length
          state.config.series.push({
            ...series,
            color: CHART_COLORS[colorIndex],
            enabled: true
          })
        }
      }),

    removeSeries: (address) =>
      set((state) => {
        state.config.series = state.config.series.filter((s) => s.address !== address)
      }),

    toggleSeries: (address) =>
      set((state) => {
        const series = state.config.series.find((s) => s.address === address)
        if (series) {
          series.enabled = !series.enabled
        }
      }),

    updateSeriesColor: (address, color) =>
      set((state) => {
        const series = state.config.series.find((s) => s.address === address)
        if (series) {
          series.color = color
        }
      }),

    history: {},

    appendDataPoint: (address, point) =>
      set((state) => {
        if (!state.history[address]) {
          state.history[address] = []
        }
        state.history[address].push(point)
        if (state.history[address].length > state.config.maxDataPoints) {
          state.history[address].shift()
        }
      }),

    clearHistory: () =>
      set((state) => {
        state.history = {}
      }),

    showConfig: false,

    setShowConfig: (show) =>
      set((state) => {
        state.showConfig = show
      })
  }))
)

onEvent('register_data', (registerData: RegisterData[]) => {
  const chartState = useChartZustand.getState()
  if (!chartState.config.enabled || chartState.config.series.length === 0) return

  const now = Date.now()
  registerData.forEach((register) => {
    const series = chartState.config.series.find((s) => s.address === register.id)
    if (series && series.enabled && NUMERIC_DATA_TYPES.includes(series.dataType)) {
      const value = getNumericValue(register, series.dataType)
      if (value !== null) {
        chartState.appendDataPoint(register.id, {
          timestamp: now,
          value,
          address: register.id
        })
      }
    }
  })
})
