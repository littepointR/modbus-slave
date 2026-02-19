import { GridColDef } from '@mui/x-data-grid'
import { RegisterType, ScanUnitIDResult } from '@shared'
import { useMemo } from 'react'
import { useScanUnitIdZustand } from './_zustand'
import { Box, Chip } from '@mui/material'
import { CheckCircle, ErrorRounded } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'

const useUnitIdColumn = (): GridColDef<ScanUnitIDResult, number, number> => {
  const { t } = useTranslation()
  return {
    field: 'id',
    headerName: t('scan.unitId'),
    hideable: false,
    width: 60,
    disableColumnMenu: true
  }
}

const useTypeColumn = (registerType: RegisterType, nameKey: string): GridColDef<ScanUnitIDResult> => {
  const { t } = useTranslation()
  return {
    field: registerType,
    type: 'boolean',
    headerName: t(nameKey),
    disableColumnMenu: false,
    width: 90,
    valueGetter: (_, row) => row.registerTypes.includes(registerType),
    renderCell: ({ value, row }) => (
      <Box sx={{ width: '100%', display: 'flex' }}>
        {value ? (
          <Chip icon={<CheckCircle />} label={t('common.ok')} size="small" color="success" />
        ) : row.requestedRegisterTypes.includes(registerType) ? (
          <Chip icon={<ErrorRounded />} label={t('common.error')} size="small" color="error" />
        ) : null}
      </Box>
    )
  }
}

const useErrorColumn = (): GridColDef<ScanUnitIDResult> => {
  const { t } = useTranslation()
  return {
    field: 'errorMessage',
    headerName: t('scan.error'),
    flex: 1,
    minWidth: 150,
    disableColumnMenu: true,
    renderCell: ({ value }) =>
      value === null ? null : (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {Object.entries(value).map(([k, v]) => {
            return String(v).length === 0 ? null : (
              <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span>
                  {k === 'coils'
                    ? 'FC1'
                    : k === 'discrete_inputs'
                      ? 'FC2'
                      : k === 'holding_registers'
                        ? 'FC3'
                        : 'FC4'}
                  :
                </span>
                <span>{String(v)}</span>
              </Box>
            )
          })}
        </Box>
      )
  }
}

const useScanUnitIdColumns = (): GridColDef<ScanUnitIDResult>[] => {
  const registerTypes = useScanUnitIdZustand((z) => z.registerTypes)
  const unitIdColumn = useUnitIdColumn()
  const errorColumn = useErrorColumn()

  return useMemo(() => {
    const newColumns = [unitIdColumn]

    if (registerTypes.includes('coils')) newColumns.push(useTypeColumn('coils', 'scan.coils'))
    if (registerTypes.includes('discrete_inputs'))
      newColumns.push(useTypeColumn('discrete_inputs', 'scan.discreteInputs'))
    if (registerTypes.includes('input_registers'))
      newColumns.push(useTypeColumn('input_registers', 'scan.inputRegisters'))
    if (registerTypes.includes('holding_registers'))
      newColumns.push(useTypeColumn('holding_registers', 'scan.holdingRegisters'))

    newColumns.push(errorColumn)

    return newColumns
  }, [registerTypes, unitIdColumn, errorColumn])
}

export default useScanUnitIdColumns
