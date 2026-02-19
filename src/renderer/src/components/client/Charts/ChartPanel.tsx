import { useMemo, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush
} from 'recharts'
import { Paper, Box, Typography } from '@mui/material'
import { useChartZustand } from './chart.zustand'
import { DateTime } from 'luxon'

interface ChartDataRow {
  timestamp: number
  [address: string]: number | null
}

export const ChartPanel = (): JSX.Element | null => {
  const { config, history } = useChartZustand()

  const enabledSeries = useMemo(() => {
    return config.series.filter((s) => s.enabled)
  }, [config.series])

  const chartData = useMemo<ChartDataRow[]>(() => {
    if (enabledSeries.length === 0) return []

    const allTimestamps = new Set<number>()
    enabledSeries.forEach((series) => {
      const seriesHistory = history[series.address] || []
      seriesHistory.forEach((point) => allTimestamps.add(point.timestamp))
    })

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b)

    return sortedTimestamps.map((timestamp) => {
      const row: ChartDataRow = { timestamp }
      enabledSeries.forEach((series) => {
        const seriesHistory = history[series.address] || []
        const point = seriesHistory.find((p) => p.timestamp === timestamp)
        row[series.address.toString()] = point?.value ?? null
      })
      return row
    })
  }, [enabledSeries, history])

  const formatXAxis = useCallback((timestamp: number) => {
    return DateTime.fromMillis(timestamp).toFormat('HH:mm:ss')
  }, [])

  const formatTooltip = useCallback(
    (value: number | string | Array<number | string> | null | undefined, name: string) => {
      if (value === null || value === undefined) return ['-', name]
      const numValue = typeof value === 'number' ? value : null
      if (numValue === null) return ['-', name]
      const series = enabledSeries.find((s) => s.address.toString() === name)
      const displayName = series?.name || `Address ${name}`
      return [numValue.toFixed(4), displayName]
    },
    [enabledSeries]
  )

  const formatTooltipLabel = useCallback((timestamp: number) => {
    return DateTime.fromMillis(timestamp).toFormat('yyyy-MM-dd HH:mm:ss.SSS')
  }, [])

  if (!config.enabled) return null

  return (
    <Paper sx={{ flexGrow: 1, minHeight: 400, p: 2, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" component="h2">{config.enabled ? 'Real-time Chart' : 'Chart'}</Typography>
        <Typography variant="caption" color="text.secondary">
          {enabledSeries.length} series • {chartData.length} points
        </Typography>
      </Box>

      {enabledSeries.length === 0 ? (
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 300
          }}
        >
          <Typography variant="body1" color="text.secondary">
            No series selected. Add registers to the chart to see real-time data.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ flexGrow: 1, minHeight: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatXAxis}
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
              />
              <YAxis />
              <Tooltip
                formatter={formatTooltip as never}
                labelFormatter={formatTooltipLabel}
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e0e0e0',
                  borderRadius: 4
                }}
              />
              <Legend />
              {enabledSeries.map((series) => (
                <Line
                  key={series.address}
                  type="monotone"
                  dataKey={series.address.toString()}
                  name={series.name || `Address ${series.address}`}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
              <Brush dataKey="timestamp" tickFormatter={formatXAxis} height={30} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  )
}

export default ChartPanel
