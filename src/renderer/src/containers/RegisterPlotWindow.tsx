import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip
} from '@mui/material'
import type { PlotInterpretation, RegisterPlotData, RegisterPlotWindowInit } from '@shared'
import { onEvent } from '@renderer/events'
import { decodePlotValue, getWordSpanForInterpretation } from './register-plot.helpers'

interface PlotSample extends RegisterPlotData {}

const INTERPRETATION_OPTIONS: PlotInterpretation[] = [
  'short',
  'ushort',
  'int',
  'uint',
  'long',
  'ulong',
  'float',
  'double'
]

const STROKE_PATTERNS = ['', '6 4', '2 3', '10 4', '4 2 1 2']

const RegisterPlotWindow = (): JSX.Element => {
  const [config, setConfig] = useState<RegisterPlotWindowInit | null>(null)
  const [samples, setSamples] = useState<PlotSample[]>([])
  const [seriesMode, setSeriesMode] = useState<Record<number, PlotInterpretation>>({})

  useEffect(() => {
    const offInit = onEvent('register_plot_init', (init) => {
      setConfig(init)
      const nextModes: Record<number, PlotInterpretation> = {}
      init.series.forEach((s) => {
        nextModes[s.address] = s.interpretation
      })
      setSeriesMode(nextModes)
      document.title = init.title
    })

    const offData = onEvent('register_plot_data', (packet) => {
      setSamples((prev) => {
        if (!config) return prev
        if (config && packet.chartId !== config.chartId) {
          return prev
        }
        const next = [...prev, packet]
        if (next.length > 240) return next.slice(next.length - 240)
        return next
      })
    })

    return () => {
      offInit()
      offData()
    }
  }, [config])

  const chartSeries = useMemo(() => {
    if (!config) return []
    return config.series.map((series, idx) => {
      const mode = seriesMode[series.address] ?? series.interpretation
      const points = samples
        .map((sample, sampleIdx) => ({
          x: sampleIdx,
          y: decodePlotValue(sample.rawRegisters, series.address, mode)
        }))
        .filter((point) => Number.isFinite(point.y))
      return {
        ...series,
        mode,
        pattern: STROKE_PATTERNS[idx % STROKE_PATTERNS.length],
        points
      }
    })
  }, [config, samples, seriesMode])

  const yRange = useMemo(() => {
    const allValues = chartSeries.flatMap((s) => s.points.map((p) => p.y as number))
    if (allValues.length === 0) return { min: -1, max: 1 }
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    if (min === max) return { min: min - 1, max: max + 1 }
    return { min, max }
  }, [chartSeries])

  const width = 1000
  const height = 360
  const padding = 40
  const plotWidth = width - padding * 2
  const plotHeight = height - padding * 2
  const maxX = Math.max(samples.length - 1, 1)

  const toX = (x: number): number => padding + (x / maxX) * plotWidth
  const toY = (y: number): number => padding + ((yRange.max - y) / (yRange.max - yRange.min)) * plotHeight

  const buildPath = (points: Array<{ x: number; y: number | null }>): string => {
    let path = ''
    points.forEach((point) => {
      if (!Number.isFinite(point.y)) return
      const x = toX(point.x)
      const y = toY(point.y as number)
      path += path ? ` L ${x} ${y}` : `M ${x} ${y}`
    })
    return path
  }

  if (!config) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Waiting for plot configuration...
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2, height: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6">{config.title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {config.connectionAlias} / {config.slaveAlias} / {config.registerGroupName}
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {config.series.map((series, idx) => {
            const mode = seriesMode[series.address] ?? series.interpretation
            return (
              <Box key={series.address} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={series.label}
                  size="small"
                  sx={{ bgcolor: series.color, border: '1px solid rgba(0,0,0,0.12)' }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Interpret</InputLabel>
                  <Select
                    label="Interpret"
                    value={mode}
                    onChange={(e) =>
                      setSeriesMode((prev) => ({
                        ...prev,
                        [series.address]: e.target.value as PlotInterpretation
                      }))
                    }
                  >
                    {INTERPRETATION_OPTIONS.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option.toUpperCase()} ({getWordSpanForInterpretation(option)}w)
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary">
                  #{idx + 1}
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minHeight: 320 }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none">
          <rect x={padding} y={padding} width={plotWidth} height={plotHeight} fill="none" stroke="#c7c7c7" strokeWidth="1" />
          {([0.25, 0.5, 0.75] as const).map((ratio) => (
            <line
              key={ratio}
              x1={padding}
              y1={padding + plotHeight * ratio}
              x2={padding + plotWidth}
              y2={padding + plotHeight * ratio}
              stroke="#e1e1e1"
              strokeWidth="1"
            />
          ))}
          {chartSeries.map((series) => (
            <path
              key={series.address}
              d={buildPath(series.points)}
              fill="none"
              stroke={series.color}
              strokeWidth="2.5"
              strokeDasharray={series.pattern}
            />
          ))}
          <text x={6} y={padding + 2} fontSize="11" fill="#666">
            {yRange.max.toPrecision(6)}
          </text>
          <text x={6} y={height - padding + 4} fontSize="11" fill="#666">
            {yRange.min.toPrecision(6)}
          </text>
        </svg>
      </Paper>
    </Box>
  )
}

export default RegisterPlotWindow
