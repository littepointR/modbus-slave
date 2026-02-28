# Modbus Slave (Gemini Instructional Context)

Modbus Slave is a professional Modbus Client/Server simulation tool built with Electron, React, and TypeScript. It is currently undergoing a strategic shift (v2.0) to focus primarily on being a high-performance, professional-grade **Modbus Slave (Server) Emulator**.

## Core Mandates & Vision
- **Server-First:** Prioritize Modbus Slave simulation features (Multi-Slave, Traffic Monitoring, Easing Functions).
- **Type Safety:** Strict TypeScript usage across Main and Renderer processes.
- **Performance:** Efficient handling of large-scale register spaces (up to 65535 registers per type) and high-frequency polling.
- **Reliability:** Comprehensive testing with Vitest (Unit) and Playwright (E2E).

## Technical Stack
- **Framework:** Electron with `electron-vite`
- **Frontend:** React 18, Material-UI (MUI v6)
- **State Management:** Zustand (with `mutative` and `persist` middleware)
- **Protocol Core:** `modbus-serial`, `serialport`
- **Data Validation:** Zod
- **Utilities:** Luxon (Time), Lodash, Monaco Editor (Scripting)
- **Testing:** Vitest, Playwright

## Project Architecture

### 1. Main Process (`src/main`)
- **`index.ts`**: Entry point, manages window lifecycle and module initialization.
- **`ipc.ts`**: Centralized IPC handler and event registry.
- **`modules/modbusServer.ts`**: Core logic for managing Modbus protocol adapters and register data.
- **`modules/trafficMonitor.ts`**: Intercepts and records RX/TX packets for the Communication Monitor.
- **`modules/systemLogger.ts`**: High-performance JSON-based logger with file rotation and memory buffering.
- **`modules/cliWorkspace.ts`**: Runtime for CLI-driven workspace management.

### 2. Renderer Process (`src/renderer`)
- **Containers**: `Server.tsx`, `CommLogWindow.tsx`, `RegisterPlotWindow.tsx`, `ScriptEditorWindow.tsx`.
- **Context**: `root.zustand.ts` (Global config), `server.zustand.ts` (Server state), `layout.zustand.ts`.
- **UI Architecture**: Multi-window approach where sub-windows (Plot, Editor) share state via IPC.

### 3. Shared Layer (`src/shared`)
- **Types**: Centralized domain types (`server.ts`, `comm.ts`, `datatype.ts`).
- **Utils**: `crc.ts` (Modbus CRC/LRC), `excel.ts` (Import/Export), `conversion.ts`.
- **Migrations**: Versioned state migrations for persisted Zustand stores.

## Key Workflows

### Development Commands
```bash
# Start development environment (HMR enabled)
yarn dev

# Run all quality checks (Lint, Typecheck, Unit Tests, E2E Tests)
yarn checkup

# Run unit tests
yarn test

# Run E2E tests (Requires build first)
yarn test:e2e

# Build for production
yarn build:win  # or :mac, :linux
```

### Core Logic: Modbus Register Handling
- **Register Types**: Coils, Discrete Inputs, Input Registers, Holding Registers.
- **Data Types**: Supports Int16/32/64, Float, Double, UTF-8 Strings, etc.
- **Value Generators**: Registers can be static or dynamic (using Easing Functions or Random generators).

## v2.0 Implementation Goals (Reference `IMPLEMENTATION_PLAN.md`)
1. **Multi-Slave Simulation**: Support multiple Slave IDs on a single port/server.
2. **Extended Protocols**: ASCII, UDP, RTU-over-TCP, RTU-over-UDP.
3. **Professional Tooling**: Byte-order conversion, CRC calculator, and Excel-based register mapping.

## Development Conventions
- **Surgical Edits**: Use `replace` for targeted code updates.
- **Testing**: Every bug fix or feature must include a corresponding test in `__tests__` or `e2e/`.
- **Naming**: Follow existing camelCase for functions/variables and PascalCase for Components/Classes.
- **State**: Prefer `zustand` for frontend state; avoid Prop Drilling. Use `mutative` for immutable updates.
