# Modbus Slave Emulator (Gemini Instructional Context)

Modbus Slave Emulator is a high-performance simulation tool built with Electron, React, and TypeScript. It is optimized for simulating complex Modbus server environments with a focus on multi-slave support and real-time monitoring.

## Core Mandates & Vision
- **Server-First Simulation**: prioritize multi-slave (Unit ID) support and diverse protocol compatibility (TCP, RTU, UDP, ASCII).
- **Data Integrity**: enforce strict Type Safety and Zod-based validation for workspace configurations.
- **Observability**: provide deep visibility into Modbus traffic with millisecond-level precision.
- **Safety**: prevent data loss through "Unsaved Changes" protection and automatic workspace finger-printing.

## Technical Stack
- **Backend**: Electron (Node.js), `modbus-serial`, `serialport`.
- **Frontend**: React 18, MUI v6, Zustand (with `mutative` & `persist`).
- **Validation**: Zod (for workspace snapshots).
- **Tooling**: `electron-vite`, Vitest, Playwright (E2E).

## Architecture & Logic

### 1. Main Process (`src/main`)
- **`index.ts`**: manages window lifecycle and title-bar customization.
- **`ipc.ts`**: centralized IPC handler using `ipcHandle` wrapper.
- **`modules/modbusServer.ts`**: handles protocol adapters and register data management.
- **`modules/trafficMonitor.ts`**: captures and parses Modbus PDU packets.

### 2. Renderer Process (`src/renderer`)
- **Containers**: `Server.tsx` (Core Workspace), `CommLogWindow.tsx`, `RegisterPlotWindow.tsx`.
- **Hooks**: `useWindowAlwaysOnTop.ts`, `useWorkspace.ts` (Planned).
- **Standards**: adhere to [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

## Key Workflows & Features (v2.1+)
- **Multi-Slave Support**: simulate multiple devices on a single physical/virtual connection.
- **Unsaved State Guard**: uses `attachCloseRequestBridge` in Main and `request_window_close` event in Renderer to prevent accidental data loss.
- **Easing Functions**: dynamic register value generation using standardized easing algorithms.

## Development Conventions
- **Accessibility**: every `IconButton` must have an `aria-label`.
- **Testing**: maintain 100% pass rate for `yarn checkup`.
- **Documentation**: keep `README.md` and `GEMINI.md` synchronized with feature updates.
