import { useState, useMemo, useCallback } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import List from '@mui/material/List'
import Button from '@mui/material/Button'
import Toolbar from '@mui/material/Toolbar'
import { alpha, useTheme } from '@mui/material/styles'
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Memory as MemoryIcon,
  ToggleOn as ToggleOnIcon,
  ToggleOff as ToggleOffIcon,
  Storage as StorageIcon,
  DataObject as DataObjectIcon,
  Dns as DnsIcon,
  Add as AddIcon
} from '@mui/icons-material'
import { useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { ServerRegisters, UnitIdString, BooleanRegisters, NumberRegisters } from '@shared'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

interface TreeNode {
  id: string
  label: string
  count?: number
  icon?: React.ReactNode
  children?: TreeNode[]
  type: 'server' | 'unitId' | 'register'
  registerType?: BooleanRegisters | NumberRegisters
  unitId?: UnitIdString
}

interface TreeItemProps {
  node: TreeNode
  level: number
  selectedId: string | null
  onSelect: (node: TreeNode) => void
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
}

const TreeItem = meme(
  ({
    node,
    level,
    selectedId,
    onSelect,
    expandedIds,
    onToggleExpand
  }: TreeItemProps): JSX.Element => {
    const theme = useTheme()
    const isExpanded = expandedIds.has(node.id)
    const isSelected = selectedId === node.id
    const hasChildren = node.children && node.children.length > 0

    const handleClick = useCallback(() => {
      if (hasChildren) {
        onToggleExpand(node.id)
      }
      onSelect(node)
    }, [hasChildren, node, onToggleExpand, onSelect])

    const handleIconClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onToggleExpand(node.id)
      },
      [node.id, onToggleExpand]
    )

    return (
      <Box>
        <ListItemButton
          onClick={handleClick}
          selected={isSelected}
          sx={{
            pl: level * 2 + 1,
            py: 0.5,
            minHeight: 32,
            borderRadius: 1,
            mx: 0.5,
            '&.Mui-selected': {
              backgroundColor: alpha(theme.palette.primary.main, 0.15),
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.25)
              }
            },
            '&:hover': {
              backgroundColor: alpha(theme.palette.action.hover, 0.08)
            }
          }}
        >
          {hasChildren && (
            <ListItemIcon sx={{ minWidth: 24 }}>
              <IconButton
                size="small"
                onClick={handleIconClick}
                sx={{
                  p: 0.25,
                  color: theme.palette.text.secondary
                }}
              >
                {isExpanded ? (
                  <ExpandMoreIcon fontSize="small" />
                ) : (
                  <ChevronRightIcon fontSize="small" />
                )}
              </IconButton>
            </ListItemIcon>
          )}
          {!hasChildren && <Box sx={{ width: 24 }} />}
          {node.icon && <ListItemIcon sx={{ minWidth: 28 }}>{node.icon}</ListItemIcon>}
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? theme.palette.primary.main : theme.palette.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {node.label}
                </Typography>
                {node.count !== undefined && node.count > 0 && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: theme.palette.text.secondary,
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 0.5,
                      fontSize: '0.65rem',
                      minWidth: 20,
                      textAlign: 'center'
                    }}
                  >
                    {node.count}
                  </Typography>
                )}
              </Box>
            }
            sx={{ m: 0 }}
          />
        </ListItemButton>

        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List disablePadding>
              {node.children!.map((child) => (
                <TreeItem
                  key={child.id}
                  node={child}
                  level={level + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                />
              ))}
            </List>
          </Collapse>
        )}
      </Box>
    )
  }
)

const REGISTER_CONFIG: Record<
  BooleanRegisters | NumberRegisters,
  { label: string; icon: React.ReactNode }
> = {
  coils: { label: 'Coils', icon: <ToggleOnIcon fontSize="small" color="warning" /> },
  discrete_inputs: {
    label: 'Discrete Inputs',
    icon: <ToggleOffIcon fontSize="small" color="info" />
  },
  input_registers: {
    label: 'Input Registers',
    icon: <DataObjectIcon fontSize="small" color="success" />
  },
  holding_registers: {
    label: 'Holding Registers',
    icon: <StorageIcon fontSize="small" color="primary" />
  }
}

const getRegisterCount = (
  registers: ServerRegisters | undefined,
  registerType: keyof ServerRegisters
): number => {
  if (!registers) return 0
  return Object.keys(registers[registerType] || {}).length
}

interface ServerTreeNavigationProps {
  onSelectNode?: (node: TreeNode) => void
}

const ServerTreeNavigation = meme(({ onSelectNode }: ServerTreeNavigationProps): JSX.Element => {
  const theme = useTheme()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['server-root']))
  const [selectedId, setSelectedId] = useState<string | null>('server-root')
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null)

  const selectedUuid = useServerZustand((z) => z.selectedUuid)
  const serverName = useServerZustand((z) => z.name[selectedUuid])
  const serverRegisters = useServerZustand((z) => z.serverRegisters[selectedUuid])
  const port = useServerZustand((z) => z.port[selectedUuid])
  const setUnitId = useServerZustand((z) => z.setUnitId)
  const currentUnitId = useServerZustand((z) => z.getUnitId(selectedUuid))

  const treeData = useMemo((): TreeNode => {
    const unitIdsWithData = serverRegisters ? Object.keys(serverRegisters) : []
    const sortedUnitIds = unitIdsWithData.sort((a, b) => Number(a) - Number(b))

    const unitIdNodes: TreeNode[] = sortedUnitIds.map((unitId) => {
      const registers = serverRegisters![unitId as UnitIdString]
      const isActive = unitId === currentUnitId

      const registerNodes: TreeNode[] = (
        ['coils', 'discrete_inputs', 'input_registers', 'holding_registers'] as const
      ).map((regType) => ({
        id: `unit-${unitId}-${regType}`,
        label: REGISTER_CONFIG[regType].label,
        count: getRegisterCount(registers, regType),
        icon: REGISTER_CONFIG[regType].icon,
        type: 'register' as const,
        registerType: regType,
        unitId: unitId as UnitIdString
      }))

      return {
        id: `unit-${unitId}`,
        label: `Unit ${unitId}${isActive ? ' (Active)' : ''}`,
        type: 'unitId' as const,
        unitId: unitId as UnitIdString,
        icon: <DnsIcon fontSize="small" color={isActive ? 'primary' : 'action'} />,
        children: registerNodes
      }
    })

    const displayName = serverName || `Server ${port}`

    return {
      id: 'server-root',
      label: displayName,
      type: 'server',
      icon: <MemoryIcon fontSize="small" color="action" />,
      children: unitIdNodes
    }
  }, [serverRegisters, serverName, port, currentUnitId])

  const availableUnitIds = useMemo(() => {
    const existing = new Set(serverRegisters ? Object.keys(serverRegisters) : [])
    return Array.from({ length: 256 }, (_, i) => String(i)).filter((id) => !existing.has(id))
  }, [serverRegisters])

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelect = useCallback(
    (node: TreeNode) => {
      setSelectedId(node.id)
      if (node.type === 'unitId' && node.unitId) {
        setUnitId(node.unitId)
      }
      onSelectNode?.(node)
    },
    [onSelectNode, setUnitId]
  )

  const handleAddSlaveClick = (event: React.MouseEvent<HTMLElement>) => {
    setAddMenuAnchor(event.currentTarget)
  }

  const handleAddSlaveClose = () => {
    setAddMenuAnchor(null)
  }

  const handleSelectNewSlave = (unitId: string) => {
    setUnitId(unitId as UnitIdString)
    handleAddSlaveClose()
    setExpandedIds((prev) => new Set([...prev, 'server-root']))
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.palette.background.paper,
        borderRight: `1px solid ${theme.palette.divider}`
      }}
    >
      <Toolbar
        variant="dense"
        sx={{
          minHeight: 40,
          px: 1,
          gap: 1,
          borderBottom: `1px solid ${theme.palette.divider}`
        }}
      >
        <Typography variant="subtitle2" sx={{ flexGrow: 1, fontWeight: 600 }}>
          Slaves ({serverRegisters ? Object.keys(serverRegisters).length : 0}/256)
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddSlaveClick}
          disabled={availableUnitIds.length === 0}
          sx={{ minWidth: 0, px: 1 }}
        >
          Add
        </Button>
        <Menu
          anchorEl={addMenuAnchor}
          open={Boolean(addMenuAnchor)}
          onClose={handleAddSlaveClose}
          PaperProps={{
            sx: { maxHeight: 300, width: 120 }
          }}
        >
          {availableUnitIds.slice(0, 50).map((unitId) => (
            <MenuItem key={unitId} onClick={() => handleSelectNewSlave(unitId)} dense>
              Unit {unitId}
            </MenuItem>
          ))}
          {availableUnitIds.length > 50 && (
            <MenuItem disabled dense>
              ...and {availableUnitIds.length - 50} more
            </MenuItem>
          )}
        </Menu>
      </Toolbar>

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(theme.palette.text.primary, 0.2),
            borderRadius: 3
          }
        }}
      >
        <List disablePadding sx={{ py: 0.5 }}>
          <TreeItem
            node={treeData}
            level={0}
            selectedId={selectedId}
            onSelect={handleSelect}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
          />
        </List>
      </Box>
    </Box>
  )
})

export default ServerTreeNavigation
export type { TreeNode, ServerTreeNavigationProps }
