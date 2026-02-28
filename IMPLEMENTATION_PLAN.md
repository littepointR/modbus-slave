# Modbus Slave Server - 专业 Modbus 从机仿真器

## 项目概述

基于对 Redisant Modbus Slave Emulator (MSE) 的深度分析，制定本实现计划。**本版本专注从机(Server)功能，移除主机(Client)功能**，目标是实现一个功能完整、专业级的 Modbus 从机仿真工具，具备多从站仿真、通信监视、数据转换、实时绘图、缓动函数等高级功能。

**工作区:** `/Users/suyue/work/modbus-slave/.worktrees/redisant-replication`  
**分支:** `feature/redisant-replication`  
**基础版本:** v1.6.0  
**定位:** 专注 Modbus Server/Slave 仿真

---

## 一、功能差距分析

### 当前 Modbus Slave vs Redisant MSE (从机功能对比)

| 功能模块 | Redisant MSE | Modbus Slave 当前 | 差距等级 |
|---------|-------------|------------|---------|
| **协议支持** | 6种 (RTU/ASCII/TCP/UDP/RTUoverTCP/RTUoverUDP) | 2种 (RTU/TCP) | ⭐⭐⭐ 高 |
| **多从站仿真** | 一端口多Slave ID | ❌ 单Server | ⭐⭐⭐ 高 |
| **通信监视** | 完整报文监视 (RX请求/TX响应, 时间戳) | ❌ 无 | ⭐⭐⭐ 高 |
| **数据转换工具** | Float/Long/Double互转 + 字节序工具 | ❌ 无 | ⭐⭐⭐ 高 |
| **实时图表** | 多曲线、Y轴设置、导出 | ✅ 已实现 | ⭐ 低 |
| **缓动函数** | 几十种缓动函数模拟数据 | ⚠️ 基础版 | ⭐⭐ 中 |
| **Excel导入/导出** | 从站数据 ↔ Excel | ❌ 无 | ⭐⭐ 中 |
| **树状导航** | 连接→从站→数据区三级 | ⚠️ 部分 | ⭐⭐ 中 |
| **通信统计** | Read/Write计数 | ⚠️ 部分 | ⭐ 低 |
| **校验码工具** | CRC/LRC计算器 | ❌ 无 | ⭐⭐ 中 |
| **C#脚本** | 动态数据返回 | ❌ 无 | ⭐ 低 |

### 本版本范围说明

**✅ 保留功能 (Server-Only):**
- Server 模式：多从站仿真
- 通信监视：监听请求/响应报文
- 数据转换工具：辅助配置从站数据
- 实时图表：监控寄存器变化
- 缓动函数：动态数据模拟
- Excel 导入/导出：批量数据管理
- 树状导航：从站结构管理

**❌ 移除功能 (Client):**
- Client 模式完全移除
- 连接配置界面（主机侧）
- 读取/写入操作界面
- 扫描功能
- 主机通信协议相关代码

---

## 二、详细实现计划

### Phase 1: 协议扩展 (Week 1)
**目标:** Server 支持 6 种 Modbus 协议

#### 1.1 Modbus ASCII Server 支持
- [ ] 添加 ASCII 模式服务端
- [ ] 实现 ASCII 帧解析 (LRC校验)
- [ ] 消息帧格式: `:ADDR FUNC DATA LRC\r\n`
- [ ] 串口监听 ASCII 报文

#### 1.2 Modbus UDP Server 支持
- [ ] 添加 UDP 服务端传输层
- [ ] 实现 UDP 端口绑定与数据报收发
- [ ] 处理 UDP 无连接特性

#### 1.3 Modbus RTU Over TCP Server
- [ ] TCP 连接上接收 RTU 帧格式
- [ ] 保持 CRC 校验（而非 TCP 的 MBAP）
- [ ] 网关设备仿真支持

#### 1.4 Modbus RTU Over UDP Server
- [ ] UDP 上传输 RTU 帧
- [ ] 处理丢包场景

**技术要点:**
```typescript
// 服务端协议类型
export type ServerProtocol = 
  | 'ModbusTcpServer' 
  | 'ModbusRtuServer' 
  | 'ModbusAsciiServer'
  | 'ModbusUdpServer'
  | 'ModbusRtuOverTcpServer'
  | 'ModbusRtuOverUdpServer'
```

**文件变更:**
- `src/shared/types/server.ts` - 添加 Protocol 枚举
- `src/main/modules/modbusServer.ts` - 扩展协议支持
- `src/renderer/.../ServerConfig/` - UI 更新

---

### Phase 2: 通信监视器 (Week 1-2)
**目标:** 实现服务端报文监控 (监听请求和发送的响应)

#### 2.1 核心功能设计
- [ ] 拦截所有 RX(请求) / TX(响应) 报文
- [ ] 实时显示在独立窗口/面板
- [ ] 报文解析: MBAP/RTU/ASCII 头部分析
- [ ] 时间戳精确到毫秒
- [ ] 序号递增
- [ ] 按从站ID过滤

#### 2.2 数据结构
```typescript
interface ServerCommPacket {
  id: number                    // 序号
  timestamp: number            // 时间戳 (ms)
  direction: 'RX' | 'TX'       // 接收请求/发送响应
  protocol: ServerProtocol     // 协议类型
  frameType: 'MBAP' | 'RTU' | 'ASCII'
  clientAddr: string           // 客户端地址 (IP:Port 或串口)
  slaveId: number              // 从站ID
  functionCode: number         // 功能码
  data: Uint8Array             // 原始数据
  parsed: {                    // 解析结果
    startAddress?: number
    quantity?: number
    values?: number[]
    exception?: number
    isException?: boolean
  }
}
```

#### 2.3 UI 设计
- [ ] 独立窗口: "通信监视" (可浮动)
- [ ] 表格列: 序号 | RX/TX | 客户端 | 从站 | 功能码 | 数据 (Hex) | 解析 | 时间戳
- [ ] 功能码着色 (01-红色, 03-蓝色等)
- [ ] RX(请求) 和 TX(响应) 不同颜色区分
- [ ] 异常响应特殊标记
- [ ] 按钮: 停止/继续监控, 清除, 保存到文件, 过滤

#### 2.4 实现位置
- [ ] 主进程拦截: `src/main/modules/trafficMonitor.ts`
- [ ] IPC 通道: `server_comm_packet` 事件
- [ ] UI 组件: `src/renderer/.../CommMonitor/`

**文件列表:**
- `src/main/modules/trafficMonitor.ts` (新建)
- `src/renderer/.../CommMonitor/CommMonitor.tsx` (新建)
- `src/renderer/.../CommMonitor/PacketTable.tsx` (新建)
- `src/shared/types/comm.ts` (新建)

---

### Phase 3: 数据转换工具 (Week 2-3)
**目标:** 字节序转换 + 数据类型互转工具 (辅助配置从站数据)

#### 3.1 字节序转换工具 (Byte Order Tool)
- [ ] Float/Long/Double 各种字节序排列
- [ ] 支持顺序: AB CD, CD AB, BA DC, DC BA
- [ ] 64位: AB CD EF GH 等 8 种排列
- [ ] 实时转换显示
- [ ] 一键应用到从站寄存器

```typescript
interface ByteOrderResult {
  original: string      // 41 B8 00 00
  float: number         // 23.0
  floatSwapped: number  // 字节序交换后的值
  long: number
  longSwapped: number
  double: number
  // ... 所有排列组合
}
```

#### 3.2 校验码计算器 (CRC/LRC Tool)
- [ ] CRC16 (Modbus 标准)
- [ ] LRC (ASCII 模式)
- [ ] 输入: Hex 字符串
- [ ] 输出: 校验码结果
- [ ] 预设常用 CRC 算法

```typescript
interface CrcCalculator {
  input: string          // "01 03 00 00 00 0A"
  algorithm: 'CRC16-MODBUS' | 'LRC' | 'CRC32'
  result: string         // "C5 D9"
}
```

#### 3.3 UI 设计
- [ ] 浮动窗口 (类似计算器)
- [ ] 输入框 + 下拉选择 + 结果显示
- [ ] 一键复制结果
- [ ] 历史记录
- [ ] "应用到寄存器" 按钮

**文件列表:**
- `src/renderer/.../Tools/ByteOrderConverter.tsx`
- `src/renderer/.../Tools/CrcCalculator.tsx`
- `src/shared/utils/crc.ts` (算法实现)

---

### Phase 4: 多从站仿真 (Week 3-4)
**目标:** 单 Server 实例模拟多个 Slave ID (核心功能)

#### 4.1 架构重构
当前: `ModbusServer` 管理单一从站  
目标: `ModbusServer` 管理多个 `SlaveDevice`

```typescript
interface SlaveDevice {
  id: number              // Slave ID (1-247)
  name: string            // 从站名称 (可选)
  coils: Map<number, boolean>
  discreteInputs: Map<number, boolean>
  holdingRegisters: Map<number, number>
  inputRegisters: Map<number, number>
  enabled: boolean
  description?: string    // 备注
}

class ModbusServer {
  private slaves: Map<number, SlaveDevice>
  private protocol: ServerProtocol
  private connectionConfig: ConnectionConfig
  
  addSlave(id: number, name?: string): SlaveDevice
  removeSlave(id: number): void
  getSlave(id: number): SlaveDevice | undefined
  enableSlave(id: number, enabled: boolean): void
  
  // 请求路由
  private routeRequest(packet: RequestPacket): ResponsePacket
}
```

#### 4.2 请求路由逻辑
- [ ] 根据 Slave ID 路由请求到对应 SlaveDevice
- [ ] Slave ID 不存在时返回异常响应
- [ ] 每个 Slave 独立寄存器空间
- [ ] 禁用从站返回异常响应

#### 4.3 UI 更新
- [ ] Server 视图: 左侧树形列表显示多个 Slave
- [ ] 每个 Slave 展开显示其寄存器
- [ ] 右键菜单: 添加 Slave, 复制 Slave, 删除, 重命名
- [ ] Slave 启用/禁用开关
- [ ] 快速跳转: 点击 Slave 显示其寄存器表

**文件变更:**
- `src/main/modules/modbusServer.ts` - 重构为多从站
- `src/renderer/.../server/ServerGrid/` - 树形导航
- `src/renderer/.../server/SlaveList/` (新建)

---

### Phase 5: 缓动函数增强 (Week 4-5)
**目标:** 实现 Redisant 级别的缓动函数系统 (用于动态数据模拟)

#### 5.1 缓动函数库
实现 30+ 种缓动函数:
- [ ] Linear
- [ ] Quadratic (EaseIn, EaseOut, EaseInOut)
- [ ] Cubic, Quartic, Quintic
- [ ] Sine, Circular
- [ ] Exponential
- [ ] Elastic (EaseInElastic, EaseOutElastic, EaseInOutElastic)
- [ ] Back (EaseInBack, EaseOutBack)
- [ ] Bounce (EaseInBounce, EaseOutBounce)

```typescript
type EasingFunction = (t: number) => number

interface EasingPreset {
  name: string
  fn: EasingFunction
  category: 'Linear' | 'Quadratic' | 'Elastic' | 'Bounce'
}

// 示例: EaseOutElastic
const easeOutElastic = (t: number): number => {
  const c4 = (2 * Math.PI) / 3
  if (t === 0) return 0
  if (t === 1) return 1
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}
```

#### 5.2 缓动应用到从站
- [ ] 为寄存器绑定缓动函数
- [ ] 配置: 持续时间, 缓动函数, 最小值, 最大值
- [ ] 循环模式: 单次/循环/往复
- [ ] 多寄存器联动

#### 5.3 实时预览
- [ ] 曲线图预览 (时间-数值)
- [ ] 可拖拽调整参数
- [ ] 实时重放

#### 5.4 UI 设计
- [ ] 弹出对话框 (类似 Redisant)
- [ ] 参数配置面板
- [ ] 图表实时预览
- [ ] 应用到选定寄存器
- [ ] 按钮: 预览, 确定, 取消

**文件列表:**
- `src/shared/utils/easing.ts` (新建 - 所有缓动函数)
- `src/renderer/.../server/EasingDialog.tsx` (新建)
- `src/renderer/.../server/EasingPreview.tsx` (新建)
- `src/context/easing.zustand.ts` (新建)

---

### Phase 6: Excel 导入/导出 (Week 5-6)
**目标:** 从站数据批量管理 (配置和备份)

#### 6.1 Excel 导出
- [ ] 从站寄存器导出为 .xlsx
- [ ] 列: 从站ID, 从站名称, 数据区, 地址, 数据类型, 值, 注释
- [ ] 多 Sheet (按从站分组)
- [ ] 格式化: 表头, 颜色, 列宽
- [ ] 导出范围选择 (全部/指定从站/指定数据区)

#### 6.2 Excel 导入
- [ ] 解析 .xlsx 文件
- [ ] 映射到寄存器配置
- [ ] 数据验证 (地址范围, 数据类型)
- [ ] 冲突处理 (覆盖/跳过/合并)
- [ ] 导入预览 (显示变更)
- [ ] 自动创建不存在的从站

#### 6.3 技术选型
- [ ] 库: `xlsx` (SheetJS) 或 `exceljs`
- [ ] 注意: Electron 主进程处理文件 I/O
- [ ] 大文件分片处理

**文件列表:**
- `src/main/modules/excelHandler.ts` (新建)
- `src/renderer/.../shared/ExcelImportDialog.tsx`
- `src/renderer/.../shared/ExcelExportDialog.tsx`

---

### Phase 7: 树状导航重构 (Week 6-7)
**目标:** Redisant 风格的左侧树形导航 (专注 Server 视图)

#### 7.1 树形结构设计
```
📁 Server: COM1 (RTU - 运行中 🟢)
  ├── 📁 Slave 1 (ID: 1) - 启用
  │     ├── 📄 保持寄存器 (0-9999)
  │     ├── 📄 输入寄存器
  │     ├── 📄 线圈
  │     └── 📄 离散输入
  ├── 📁 Slave 2 (ID: 2) - 启用
  └── 📁 Slave 3 (ID: 3) - 禁用
📁 Server: 127.0.0.1:502 (TCP - 运行中 🟢)
  ├── 📁 Slave 1
  └── 📁 Slave 2
📁 Server: 192.168.1.100:502 (TCP - 停止 🔴)
```

#### 7.2 功能
- [ ] 多 Server 实例管理
- [ ] 每个 Server 下多 Slave
- [ ] 拖拽排序
- [ ] 右键菜单 (重命名, 删除, 添加子项, 启动/停止)
- [ ] 展开/折叠状态持久化
- [ ] 双击导航到对应视图
- [ ] 图标区分 (运行中/停止/从站/数据区)
- [ ] 搜索过滤

#### 7.3 组件设计
- [ ] 使用 MUI TreeView 或 react-arborist
- [ ] 虚拟滚动 (大数据量优化)

**文件列表:**
- `src/renderer/.../shared/TreeNavigator/` (新建目录)
- `src/renderer/.../shared/TreeNavigator/TreeNavigator.tsx`
- `src/renderer/.../shared/TreeNavigator/TreeNode.tsx`
- `src/renderer/.../shared/TreeNavigator/tree.zustand.ts`

---

### Phase 8: 通信统计与状态栏 (Week 7)
**目标:** 完善的通信状态显示

#### 8.1 状态栏增强
- [ ] Server 运行状态 (图标 + 文字)
- [ ] 监听参数 (COM1-9600-8-N-1 或 TCP:502)
- [ ] 实时时间
- [ ] 请求/响应 计数器
- [ ] 活动连接数
- [ ] 错误计数

#### 8.2 统计显示
- [ ] 数据包总数 (请求+响应)
- [ ] 按功能码统计
- [ ] 按从站ID统计
- [ ] 平均响应时间
- [ ] 错误率
- [ ] 吞吐量 (bytes/s)

#### 8.3 UI 设计
- [ ] 底部状态栏常驻显示
- [ ] 详细统计弹窗
- [ ] 图表: 实时吞吐量

**文件列表:**
- `src/renderer/.../shared/StatusBar/` (重构)
- `src/renderer/.../shared/StatisticsDialog.tsx` (新建)

---

### Phase 9: 高级功能 (Week 8-9)

#### 9.1 PLC 地址转换
- [ ] Modbus 地址 ↔ PLC 地址切换显示
- [ ] 40001 → 0 (保持寄存器)
- [ ] 30001 → 0 (输入寄存器)
- [ ] 10001 → 0 (线圈)
- [ ] 00001 → 0 (离散输入)

#### 9.2 数据模板
- [ ] 预定义常用设备模板
- [ ] 模板: 电表, 温湿度传感器, PLC等
- [ ] 一键应用模板到从站
- [ ] 自定义模板保存

#### 9.3 响应延迟模拟
- [ ] 模拟网络延迟
- [ ] 按从站设置不同延迟
- [ ] 随机延迟范围

#### 9.4 异常响应模拟
- [ ] 配置从站返回异常码
- [ ] 模拟超时
- [ ] 模拟 CRC 错误

---

## 三、技术架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ TreeNavigator│ │ CommMonitor  │ │ ChartPanel   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ ByteOrderTool│ │ EasingDialog │ │ ExcelDialog  │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐                        │
│  │ServerConfig  │ │ Statistics   │                        │
│  └──────────────┘ └──────────────┘                        │
├─────────────────────────────────────────────────────────────┤
│                      Renderer Process                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ serverStore  │ │ commStore    │ │ treeStore    │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
├─────────────────────────────────────────────────────────────┤
│                         IPC Layer                           │
│  server_request │ server_response │ traffic_log │ excel_io │
├─────────────────────────────────────────────────────────────┤
│                       Main Process                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ModbusServer  │ │TrafficMonitor│ │ExcelHandler  │        │
│  │  (Multi-Slave)│ └──────────────┘ └──────────────┘        │
│  └──────────────┘ ┌──────────────┐ ┌──────────────┐        │
│                   │CrcCalculator │ │EasingEngine  │        │
│                   └──────────────┘ └──────────────┘        │
├─────────────────────────────────────────────────────────────┤
│                      Hardware Layer                         │
│  TCP/UDP Socket │ Serial Port │ File System                │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、文件结构规划

```
src/
├── main/
│   ├── modules/
│   │   ├── modbusServer.ts          # 多从站 Server (重构)
│   │   ├── trafficMonitor.ts        # 通信监视 (NEW)
│   │   ├── excelHandler.ts          # Excel处理 (NEW)
│   │   └── easingEngine.ts          # 缓动函数引擎 (NEW)
│   └── index.ts
├── preload/
│   └── index.ts                     # 添加新IPC通道
├── renderer/
│   └── src/
│       ├── components/
│       │   ├── server/              # Server 组件 (原 client/ 移除)
│       │   │   ├── ServerConfig/    # Server 配置
│       │   │   ├── ServerGrid/      # 寄存器表格
│       │   │   ├── SlaveList/       # 多从站列表 (NEW)
│       │   │   ├── ServerTree/      # 服务端树形 (NEW)
│       │   │   ├── CommMonitor/     # 通信监视 (NEW)
│       │   │   │   ├── CommMonitor.tsx
│       │   │   │   ├── PacketTable.tsx
│       │   │   │   └── PacketDetail.tsx
│       │   │   ├── EasingDialog/    # 缓动函数 (NEW)
│       │   │   ├── Tools/           # 工具集合 (NEW)
│       │   │   │   ├── ByteOrderConverter.tsx
│       │   │   │   └── CrcCalculator.tsx
│       │   │   └── Charts/          # 实时图表
│       │   └── shared/
│       │       ├── TreeNavigator/   # 树形导航 (NEW)
│       │       ├── ExcelImportDialog.tsx
│       │       ├── ExcelExportDialog.tsx
│       │       ├── StatusBar/       # 状态栏重构
│       │       └── StatisticsDialog.tsx (NEW)
│       ├── context/
│       │   ├── server.zustand.ts    # Server 状态
│       │   ├── comm.zustand.ts      # 通信状态 (NEW)
│       │   ├── tree.zustand.ts      # 树形状态 (NEW)
│       │   └── easing.zustand.ts    # 缓动状态 (NEW)
│       └── utils/
│           ├── easing.ts            # 缓动函数库 (NEW)
│           ├── crc.ts               # CRC算法 (NEW)
│           └── byteOrder.ts         # 字节序转换 (NEW)
└── shared/
    ├── types/
    │   ├── server.ts                # Server 类型
    │   ├── comm.ts                  # 通信类型 (NEW)
    │   ├── easing.ts                # 缓动类型 (NEW)
    │   └── tree.ts                  # 树形类型 (NEW)
    └── utils/
        └── excel.ts                 # Excel工具
```

---

## 五、移除文件清单

以下 Client 相关文件将在重构中移除:

```
src/
├── main/
│   └── modules/
│       └── modbusClient.ts          # 移除
├── renderer/
│   └── src/
│       ├── components/
│       │   └── client/              # 整个目录移除
│       │       ├── ClientConfig/
│       │       ├── ClientGrid/
│       │       ├── ConnectionPanel/
│       │       ├── ScanPanel/
│       │       └── Charts/          # 移动到 server/
│       └── context/
│           └── client.zustand.ts    # 移除
└── shared/
    └── types/
        └── client.ts                # 移除
```

---

## 六、依赖清单

### 新增依赖
```json
{
  "dependencies": {
    "xlsx": "^0.18.5",
    "@mui/x-tree-view": "^7.0.0",
    "recharts": "^2.12.0 (已安装)"
  },
  "devDependencies": {}
}
```

### 安装命令
```bash
yarn add xlsx @mui/x-tree-view
```

---

## 七、实现优先级

### P0 (核心功能 - 必须)
1. ⭐ 多从站仿真 (Phase 4) - 核心差异化功能
2. ⭐ 通信监视器 (Phase 2) - 调试必备
3. ⭐ 数据转换工具 (Phase 3) - 辅助配置

### P1 (重要功能 - 应该)
4. 协议扩展 (Phase 1) - 支持更多设备
5. Excel 导入/导出 (Phase 6) - 数据管理
6. 缓动函数增强 (Phase 5) - 动态数据

### P2 (增强功能 - 可以)
7. 树状导航重构 (Phase 7)
8. 通信统计 (Phase 8)
9. PLC 地址转换 (Phase 9)

### P3 (可选功能)
10. 数据模板
11. 响应延迟模拟
12. 异常响应模拟

---

## 八、风险与注意事项

### 技术风险
| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **多从站性能** | 大量从站导致响应延迟 | 异步处理 + 缓存优化 |
| **串口独占** | 多 Server 抢占串口 | 串口使用检测 + 友好提示 |
| **性能问题** | 大量报文监视导致卡顿 | 虚拟滚动 + 采样率限制 |
| **Excel大文件** | 内存溢出 | 分片处理 + Web Worker |

### 兼容性
- [ ] Windows 串口 COM 命名 (`COM1` vs `/dev/ttyUSB0`)
- [ ] macOS 串口权限
- [ ] Linux USB 设备识别

---

## 九、测试计划

### 单元测试
- [ ] 所有缓动函数返回值正确 (0-1范围)
- [ ] CRC/LRC 计算结果与标准值一致
- [ ] 字节序转换所有排列组合
- [ ] 请求路由逻辑 (Slave ID 匹配)

### 集成测试
- [ ] 多从站同时响应不同 ID
- [ ] 同一端口多协议支持
- [ ] 通信监视器捕获所有报文
- [ ] Excel 导入导出数据一致

### E2E 测试
- [ ] 完整链路: 外部 Client ↔ Modbus Slave Server (多从站)
- [ ] 通信监视实时显示
- [ ] 图表实时更新
- [ ] 树形导航交互

---

## 十、里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| M1 | Week 1 | Server 协议扩展完成 (6种协议) |
| M2 | Week 2 | 通信监视器 + 数据转换工具 |
| M3 | Week 4 | 多从站仿真上线 |
| M4 | Week 6 | Excel 导入/导出 + 缓动函数 |
| M5 | Week 7 | 树状导航 + 通信统计 |
| M6 | Week 9 | 高级功能完善 |
| **Release** | Week 9 | **v2.0.0 - 专业 Modbus 从机仿真器** |

---

## 十一、参考资源

### Redisant 界面截图
- http://www.redisant.cn/image/mse/1.png - 主界面布局
- http://www.redisant.cn/image/mse/2.png - 数据转换工具
- http://www.redisant.cn/image/mse/3.png - 实时图表
- http://www.redisant.cn/image/mse/4.png - 通信监视
- http://www.redisant.cn/image/mse/5.png - 连接管理
- http://www.redisant.cn/image/mse/6.png - 缓动函数

### 技术文档
- [Modbus Protocol Spec](https://modbus.org/docs/Modbus_Application_Protocol_V1_1b3.pdf)
- [Easing Functions Cheat Sheet](https://easings.net/)
- [SheetJS Documentation](https://docs.sheetjs.com/)

---

**计划制定:** 2026-02-19  
**计划更新:** 2026-02-19 (专注从机功能)  
**计划版本:** v2.0  
**下一步:** 开始 Phase 1 - Server 协议扩展实现
