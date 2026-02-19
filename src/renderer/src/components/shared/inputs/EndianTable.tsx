import { Typography, Table, TableBody, TableCell, TableHead, TableRow, Paper } from '@mui/material'
import { useTranslation } from 'react-i18next'

const EndianTable = (): JSX.Element => {
  const { t } = useTranslation()

  return (
    <Paper sx={{ px: 3, py: 2, maxHeight: '66dvh', overflow: 'auto', minWidth: '80dvw' }}>
      <Typography variant="h6">{t('endian.title')}</Typography>
      <Typography variant="body1" sx={{ mb: 2 }}>
        {t('endian.description')}
      </Typography>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <strong>{t('endian.table.orderType')}</strong>
            </TableCell>
            <TableCell>
              <strong>{t('endian.table.register0')}</strong>
            </TableCell>
            <TableCell>
              <strong>{t('endian.table.register1')}</strong>
            </TableCell>
            <TableCell>
              <strong>{t('endian.table.sclAssignments')}</strong>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>{t('endian.bigEndian')}</TableCell>
            <TableCell>
              <strong>0x1234</strong> (W1)
            </TableCell>
            <TableCell>
              <strong>0x5678</strong> (W0)
            </TableCell>
            <TableCell>registers[0] := W1; registers[1] := W0;</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>{t('endian.littleEndian')}</TableCell>
            <TableCell>
              <strong>0x5678</strong> (W0)
            </TableCell>
            <TableCell>
              <strong>0x1234</strong> (W1)
            </TableCell>
            <TableCell>registers[0] := W0; registers[1] := W1;</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <Typography variant="body1" sx={{ mt: 2 }}>
        <strong>{t('endian.beTitle')}</strong> {t('endian.beDescription')}
      </Typography>

      <Typography variant="body2" sx={{ ml: 2, mt: 1 }}>
        - {t('endian.wordOrder')}: <strong>W1 = 0x1234</strong>, <strong>W0 = 0x5678</strong>
        <br />- {t('endian.sclAssignment')}: `registers[0] := W1`, `registers[1] := W0`
      </Typography>

      <Typography variant="body1" sx={{ mt: 2 }}>
        <strong>{t('endian.leTitle')}</strong> {t('endian.leDescription')}
      </Typography>

      <Typography variant="body2" sx={{ ml: 2, mt: 1 }}>
        - {t('endian.wordOrder')}: <strong>W1 = 0x5678</strong>, <strong>W0 = 0x1234</strong>
        <br />- {t('endian.sclAssignment')}: `registers[0] := W0`, `registers[1] := W1`
      </Typography>

      <Typography component={'div'} variant="body1" sx={{ mt: 2 }}>
        <strong>{t('endian.explanationTitle')}</strong>
        <ul>
          <li>{t('endian.beExplanation')}</li>
          <li>{t('endian.leExplanation')}</li>
        </ul>
        {t('endian.conclusion')}
      </Typography>
    </Paper>
  )
}

export default EndianTable
