import type { DataType } from '@shared'

// Chart data point
export interface ChartDataPoint {
  timestamp: number
  value: number
  address: number
}

// Series configuration for a single register
export interface ChartSeries {
  address: number
  name: string
  color: string
  dataType: DataType
  enabled: boolean
}

// Chart configuration
export interface ChartConfig {
  enabled: boolean
  maxDataPoints: number // Maximum points to keep in history (default: 1000)
  updateInterval: number // Update interval in ms (default: 100)
  series: ChartSeries[]
}

// Historical data storage
export interface ChartHistory {
  [address: number]: ChartDataPoint[]
}

// Chart Zustand state
export interface ChartZustand {
  // Configuration
  config: ChartConfig
  setConfig: (config: Partial<ChartConfig>) => void
  toggleChart: () => void
  addSeries: (series: Pick<ChartSeries, 'address' | 'name' | 'dataType'>) => void
  removeSeries: (address: number) => void
  toggleSeries: (address: number) => void
  updateSeriesColor: (address: number, color: string) => void

  // Historical data
  history: ChartHistory
  appendDataPoint: (address: number, point: ChartDataPoint) => void
  clearHistory: () => void

  // UI state
  showConfig: boolean
  setShowConfig: (show: boolean) => void
}

// Default colors for chart series
export const CHART_COLORS = [
  '#1976d2', // Blue
  '#dc004e', // Red
  '#4caf50', // Green
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
  '#ffeb3b', // Yellow
  '#795548', // Brown
  '#607d8b', // Gray
  '#e91e63' // Pink
]
