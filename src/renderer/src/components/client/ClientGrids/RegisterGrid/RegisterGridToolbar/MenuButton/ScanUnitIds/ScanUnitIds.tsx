import {
  Box,
  Button,
  InputBaseComponentProps,
  Modal,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { useRootZustand } from '@renderer/context/root.zustand'
import { ElementType, forwardRef, useCallback, useMemo } from 'react'
import { IMaskInput, IMask } from 'react-imask'
import useScanUnitIdColumns from './_columns'
import { useScanUnitIdZustand } from './_zustand'
import { ScanProgress, TimeoutInput } from '../ScanProgress/ScanProgress'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useTranslation } from 'react-i18next'

//
//
// Min/Max Masks
const MinInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const max = useScanUnitIdZustand((z) => z.range[1])

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={0}
      max={max}
      autofix
      inputRef={ref}
      onAccept={(value) => set(value, true)}
    />
  )
})

MinInput.displayName = 'MinInput'

const MaxInput = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const min = useScanUnitIdZustand((z) => z.range[0])

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={255}
      autofix
      inputRef={ref}
      onAccept={(value) => set(value, true)}
    />
  )
})

MaxInput.displayName = 'MaxInput'

//
//
// Min Max components
const MinTextField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const min = useScanUnitIdZustand((z) => String(z.range[0]))
  const setMinRange = useScanUnitIdZustand((z) => z.setMinRange)
  const { t } = useTranslation()

  return (
    <TextField
      disabled={scanning}
      label={t('client.scan.minUnitId')}
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={min}
      data-testid="scan-min-unitid-input"
      slotProps={{
        input: {
          inputComponent: MinInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setMinRange })
        }
      }}
    />
  )
}

const MaxTextField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const max = useScanUnitIdZustand((z) => String(z.range[1]))
  const setMaxRange = useScanUnitIdZustand((z) => z.setMaxRange)
  const { t } = useTranslation()

  return (
    <TextField
      disabled={scanning}
      label={t('client.scan.maxUnitId')}
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={max}
      data-testid="scan-max-unitid-input"
      slotProps={{
        input: {
          inputComponent: MaxInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setMaxRange })
        }
      }}
    />
  )
}

//
//
//
//
// Address field
const AddressField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const address = useScanUnitIdZustand((z) => String(z.address))
  const setAddress = useScanUnitIdZustand((z) => z.setAddress)
  const { t } = useTranslation()

  return (
    <TextField
      disabled={scanning}
      label={t('common.address')}
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={address}
      data-testid="scan-unitid-address-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setAddress })
        }
      }}
    />
  )
}

//
//
//
//
// Length field
const LengthField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const length = useScanUnitIdZustand((z) => String(z.length))
  const setLength = useScanUnitIdZustand((z) => z.setLength)
  const { t } = useTranslation()

  return (
    <TextField
      disabled={scanning}
      label={t('common.length')}
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={length}
      data-testid="scan-unitid-length-input"
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setLength })
        }
      }}
    />
  )
}

//
//
//
//
// Timeout field
const TimeoutField = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const timeout = useScanUnitIdZustand((z) => String(z.timeout))
  const setTimeout = useScanUnitIdZustand((z) => z.setTimeout)
  const { t } = useTranslation()

  return (
    <TextField
      disabled={scanning}
      label={`${t('common.timeout')} (ms)`}
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={timeout}
      data-testid="scan-unitid-timeout-input"
      slotProps={{
        input: {
          inputComponent: TimeoutInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setTimeout })
        }
      }}
    />
  )
}

//
//
//
//
// Select register types
const SelectRegisterTypes = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const registerTypes = useScanUnitIdZustand((z) => z.registerTypes)
  const setRegisterTypes = useScanUnitIdZustand((z) => z.setRegisterTypes)
  const { t } = useTranslation()

  return (
    <ToggleButtonGroup
      disabled={scanning}
      color="primary"
      size="small"
      value={registerTypes}
      onChange={(_, rt) => setRegisterTypes(rt)}
      aria-label="text formatting"
    >
      <ToggleButton value={'coils'}>{t('registerTypes.coils')}</ToggleButton>
      <ToggleButton value={'discrete_inputs'}>{t('registerTypes.discrete_inputs')}</ToggleButton>
      <ToggleButton value={'input_registers'}>{t('registerTypes.input_registers')}</ToggleButton>
      <ToggleButton value={'holding_registers'}>{t('registerTypes.holding_registers')}</ToggleButton>
    </ToggleButtonGroup>
  )
}

//
//
//
//
// Scan button
const ScanButton = (): JSX.Element => {
  const scanning = useRootZustand((z) => z.clientState.scanningUniId)
  const polling = useRootZustand((z) => z.clientState.polling)
  const disabled = useScanUnitIdZustand((z) => z.registerTypes.length === 0)
  const { t } = useTranslation()

  const scan = useCallback(() => {
    if (scanning) {
      window.api.stopScanningUnitIds()
      return
    }

    window.api.stopPolling()

    const state = useScanUnitIdZustand.getState()
    const rootState = useRootZustand.getState()
    rootState.clearScanUnitIdResults()
    rootState.setScanProgress(0)

    const { address, length, range, registerTypes, timeout } = state

    window.api.scanUnitIds({
      address,
      length,
      range,
      registerTypes,
      timeout
    })
  }, [scanning])

  const text = useMemo(() => (scanning ? t('client.scan.stop') : t('client.scan.start')), [scanning, t])
  const color = useMemo(() => (scanning ? 'warning' : 'primary'), [scanning])

  return (
    <Button
      disabled={disabled || polling}
      variant="contained"
      color={color}
      onClick={scan}
      data-testid="scan-unitid-start-stop-btn"
    >
      {text}
    </Button>
  )
}

//
//
//
//
// Scan result grid
const ScanResultGrid = meme(() => {
  const scanResults = useRootZustand((z) => z.scanUnitIdResults)
  const { t } = useTranslation()

  const columns = useScanUnitIdColumns()

  return (
    <DataGrid
      rows={scanResults}
      columns={columns}
      autoHeight={false}
      density="compact"
      rowHeight={40}
      columnHeaderHeight={48}
      getRowHeight={() => 'auto'}
      sx={(theme) => ({
        '& .MuiDataGrid-virtualScrollerContent': {
          fontFamily: 'monospace',
          fontSize: '0.95em'
        },
        '& .MuiToolbar-root, .MuiDataGrid-footerContainer': {
          minHeight: 36,
          height: 36,
          overflow: 'hidden'
        },
        '& .MuiDataGrid-toolbarContainer': {
          background: theme.palette.background.default
        }
      })}
      localeText={{
        noRowsLabel: t('scan.noResults')
      }}
    />
  )
})

//
//
// Scan unit ids button
const ScanUnitIdsButton = (): JSX.Element => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'connected')
  const setScanUnitIdsOpen = useScanUnitIdZustand((z) => z.setOpen)
  const { t } = useTranslation()
  return (
    <Button
      disabled={disabled}
      sx={{ my: 1 }}
      size="small"
      variant="outlined"
      onClick={() => setScanUnitIdsOpen(true)}
      data-testid="scan-unitids-btn"
    >
      {t('client.actions.scanUnitIds')}
    </Button>
  )
}

//
//
//
//
// MAIN
const ScanUnitIds = meme(() => {
  const open = useScanUnitIdZustand((z) => z.open)
  const setOpen = useScanUnitIdZustand((z) => z.setOpen)

  // Don't close while scanning
  const handleClose = useCallback(() => {
    const currentRootState = useRootZustand.getState()
    if (currentRootState.clientState.scanningUniId) return
    setOpen(false)
  }, [setOpen])

  return (
    <>
      <ScanUnitIdsButton />
      <Modal
        open={open}
        onClose={handleClose}
        sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      >
        <Paper
          elevation={5}
          sx={(theme) => ({
            background: theme.palette.background.default,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            p: 3,
            height: '90dvh',
            width: '90dvw',
            minHeight: 0
          })}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <MinTextField />
              <MaxTextField />
              <AddressField />
              <LengthField />
              <TimeoutField />
              <SelectRegisterTypes />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <ScanButton />
            </Box>
          </Box>
          <ScanProgress />
          <Paper sx={{ flex: 1, height: '100%', minHeight: 0 }}>
            <ScanResultGrid />
          </Paper>
        </Paper>
      </Modal>
    </>
  )
})
export default ScanUnitIds
