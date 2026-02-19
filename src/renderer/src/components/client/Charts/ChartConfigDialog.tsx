import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Checkbox,
  IconButton,
  Box,
  TextField,
  Typography,
  Chip
} from '@mui/material'
import { Delete as DeleteIcon } from '@mui/icons-material'
import { useChartZustand } from './chart.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useTranslation } from 'react-i18next'
import type { BaseDataType } from '@shared'

interface AvailableRegister {
  address: number
  name: string
  dataType: BaseDataType
}

export const ChartConfigDialog = (): JSX.Element => {
  const { t } = useTranslation()
  const { config, showConfig, setShowConfig, addSeries, removeSeries, toggleSeries } = useChartZustand()
  const registerData = useDataZustand((state) => state.registerData)
  const registerType = useRootZustand((state) => state.registerConfig.type)
  const registerMapping = useRootZustand((state) => state.registerMapping[registerType])
  const [searchTerm, setSearchTerm] = useState('')

  const availableRegisters = useMemo(() => {
    const registers: AvailableRegister[] = []
    registerData.forEach((reg) => {
      const mapping = registerMapping[reg.id]
      if (mapping?.dataType && mapping.dataType !== 'none') {
        registers.push({
          address: reg.id,
          name: mapping.comment || `Register ${reg.id}`,
          dataType: mapping.dataType
        })
      }
    })
    return registers.filter(
      (reg) =>
        reg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reg.address.toString().includes(searchTerm)
    )
  }, [registerData, registerMapping, searchTerm])

  const isSelected = (address: number) => {
    return config.series.some((s) => s.address === address)
  }

  const isEnabled = (address: number) => {
    return config.series.find((s) => s.address === address)?.enabled ?? false
  }

  const handleToggle = (address: number, name: string, dataType: BaseDataType) => {
    if (isSelected(address)) {
      toggleSeries(address)
    } else {
      addSeries({ address, name, dataType })
    }
  }

  const handleRemove = (address: number) => {
    removeSeries(address)
  }

  return (
    <Dialog open={showConfig} onClose={() => setShowConfig(false)} maxWidth="md" fullWidth>
      <DialogTitle>{t('chart.configTitle', 'Chart Configuration')}</DialogTitle>
      <DialogContent dividers>
        <TextField
          fullWidth
          placeholder={t('chart.searchPlaceholder', 'Search registers...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Typography variant="subtitle2">{t('chart.selectedSeries', 'Selected Series')}:</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {config.series.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('chart.noSeriesSelected', 'No series selected')}
              </Typography>
            ) : (
              config.series.map((series) => (
                <Chip
                  key={series.address}
                  label={series.name || `Address ${series.address}`}
                  size="small"
                  sx={{
                    backgroundColor: series.color,
                    color: '#fff',
                    opacity: series.enabled ? 1 : 0.5
                  }}
                  onDelete={() => handleRemove(series.address)}
                />
              ))
            )}
          </Box>
        </Box>

        <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
          {availableRegisters.map((reg) => (
            <ListItem
              key={reg.address}
              secondaryAction={
                isSelected(reg.address) ? (
                  <IconButton edge="end" onClick={() => handleRemove(reg.address)} size="small">
                    <DeleteIcon />
                  </IconButton>
                ) : null
              }
            >
              <ListItemButton onClick={() => handleToggle(reg.address, reg.name, reg.dataType)} dense>
                <Checkbox
                  checked={isSelected(reg.address)}
                  indeterminate={isSelected(reg.address) && !isEnabled(reg.address)}
                  edge="start"
                  tabIndex={-1}
                  disableRipple
                />
                <ListItemText
                  primary={`${reg.name} (Address ${reg.address})`}
                  secondary={reg.dataType}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowConfig(false)}>{t('common.close', 'Close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

export default ChartConfigDialog
