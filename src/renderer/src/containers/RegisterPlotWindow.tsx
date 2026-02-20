import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  Checkbox,
  FormControlLabel,
  Button
} from '@mui/material'
import type { RegisterPlotData, RegisterPlotWindowInit } from '@shared'
import { onEvent } from '@renderer/events'
import { decodePlotValue, getWordSpanForInterpretation } from './register-plot.helpers'
import { useTranslation } from 'react-i18next'

interface PlotSample extends RegisterPlotData {}

const STROKE_PATTERNS = ['', '6 4', '2 3', '10 4', '4 2 1 2']

const RegisterPlotWindow = (): JSX.Element => {
  const { t } = useTranslation()
  const [config, setConfig] = useState<RegisterPlotWindowInit | null>(null)
  const [samples, setSamples] = useState<PlotSample[]>([])
  const [paused, setPaused] = useState(false)
  const [xAutoScale, setXAutoScale] = useState(true)
  const [yAutoScale, setYAutoScale] = useState(true)
  const [xRangeLock, setXRangeLock] = useState<{ min: number; max: number }>({ min: 0, max: 1 })
  const [yMinInput, setYMinInput] = useState('-1')
  const [yMaxInput, setYMaxInput] = useState('1')

  useEffect(() => {
    const offInit = onEvent('register_plot_init', (init) => {
      setConfig(init)
      document.title = init.title
    })

    const offData = onEvent('register_plot_data', (packet) => {
      setSamples((prev) => {
        if (paused) return prev
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
  }, [config, paused])

  const chartSeries = useMemo(() => {
    if (!config) return []
    return config.series.map((series, idx) => {
      const mode = series.interpretation
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
  }, [config, samples])

  const autoYRange = useMemo(() => {
    const allValues = chartSeries.flatMap((s) => s.points.map((p) => p.y as number))
    if (allValues.length === 0) return { min: -1, max: 1 }
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    if (min === max) return { min: min - 1, max: max + 1 }
    return { min, max }
  }, [chartSeries])

  useEffect(() => {
    if (!yAutoScale) return
    setYMinInput(String(autoYRange.min))
    setYMaxInput(String(autoYRange.max))
  }, [autoYRange, yAutoScale])

  const yRange = useMemo(() => {
    if (yAutoScale) return autoYRange
    const yMin = Number(yMinInput)
    const yMax = Number(yMaxInput)
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin >= yMax) return autoYRange
    return { min: yMin, max: yMax }
  }, [autoYRange, yAutoScale, yMinInput, yMaxInput])

  const width = 1000
  const height = 360
  const padding = 40
  const plotWidth = width - padding * 2
  const plotHeight = height - padding * 2
  const dynamicXRange = { min: 0, max: Math.max(samples.length - 1, 1) }
  const xRange = xAutoScale ? dynamicXRange : xRangeLock
  const xSpan = Math.max(xRange.max - xRange.min, 1)
  const ySpan = Math.max(yRange.max - yRange.min, 1e-9)

  const toX = (x: number): number => padding + ((x - xRange.min) / xSpan) * plotWidth
  const toY = (y: number): number => padding + ((yRange.max - y) / ySpan) * plotHeight

  const buildPath = (points: Array<{ x: number; y: number | null }>): string => {
    let path = ''
    points.forEach((point) => {
      if (!Number.isFinite(point.y)) return
      if (point.x < xRange.min || point.x > xRange.max) return
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
    <Box
      sx={{
        p: 1,
        height: '100dvh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}
    >
      <Paper variant="outlined" sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>
              {config.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {config.connectionAlias} / {config.slaveAlias} / {config.registerGroupName}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
            <FormControlLabel
              sx={{ mr: 0 }}
              control={
                <Checkbox
                  size="small"
                  checked={xAutoScale}
                  onChange={(e) => {
                    if (!e.target.checked) {
                      setXRangeLock(dynamicXRange)
                    }
                    setXAutoScale(e.target.checked)
                  }}
                />
              }
              label={t('common.autoScaleX')}
            />
            <FormControlLabel
              sx={{ mr: 0 }}
              control={
                <Checkbox
                  size="small"
                  checked={yAutoScale}
                  onChange={(e) => setYAutoScale(e.target.checked)}
                />
              }
              label={t('common.autoScaleY')}
            />
            <TextField
              size="small"
              label={t('common.yMin')}
              value={yMinInput}
              onChange={(e) => setYMinInput(e.target.value)}
              disabled={yAutoScale}
              sx={{ width: 96 }}
            />
            <TextField
              size="small"
              label={t('common.yMax')}
              value={yMaxInput}
              onChange={(e) => setYMaxInput(e.target.value)}
              disabled={yAutoScale}
              sx={{ width: 96 }}
            />
            <Button
              size="small"
              variant={paused ? 'contained' : 'outlined'}
              onClick={() => setPaused((prev) => !prev)}
              sx={{ ml: 0.5 }}
            >
              {paused ? t('common.continue') : t('common.stop')}
            </Button>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {config.series.map((series, idx) => {
            return (
              <Box key={series.address} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={series.label}
                  size="small"
                  sx={{ bgcolor: series.color, border: '1px solid rgba(0,0,0,0.12)' }}
                />
                <Chip
                  variant="outlined"
                  label={`${series.interpretation.toUpperCase()} (${getWordSpanForInterpretation(
                    series.interpretation
                  )}w)`}
                  size="small"
                />
                <Typography variant="caption" color="text.secondary">
                  #{idx + 1}
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1, flex: 1, minHeight: 360 }}>
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
