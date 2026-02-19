import { IconButton, Tooltip, Badge } from '@mui/material'
import { ShowChart as ShowChartIcon } from '@mui/icons-material'
import { useChartZustand } from './chart.zustand'
import { useTranslation } from 'react-i18next'

export const ChartToolbarButton = (): JSX.Element => {
  const { t } = useTranslation()
  const { config, toggleChart, setShowConfig } = useChartZustand()

  const enabledCount = config.series.filter((s) => s.enabled).length

  return (
    <Tooltip title={config.enabled ? t('chart.hideChart', 'Hide Chart') : t('chart.showChart', 'Show Chart')}>
      <span>
        <IconButton
          color={config.enabled ? 'primary' : 'default'}
          onClick={() => {
            if (!config.enabled) {
              toggleChart()
              setShowConfig(true)
            } else {
              toggleChart()
            }
          }}
          size="small"
        >
          <Badge badgeContent={enabledCount > 0 ? enabledCount : null} color="secondary">
            <ShowChartIcon />
          </Badge>
        </IconButton>
      </span>
    </Tooltip>
  )
}

export default ChartToolbarButton
