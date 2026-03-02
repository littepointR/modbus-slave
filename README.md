# Modbus Slave Emulator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.6.0-blue.svg)](https://github.com/littepointR/modbus-slave/releases)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/littepointR/modbus-slave/actions)
[![Electron](https://img.shields.io/badge/Electron-32.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)

> by [ploxc](https://github.com/ploxc)

<img src="./resources/icon.png" alt="Modbus Slave Emulator Logo" width="60" />

## A Professional Modbus Slave (Server) Simulation Tool

**Modbus Slave Emulator (Modbux) is the tool I desperately needed four years ago.** It handles Modbus TCP, RTU, UDP, and ASCII, lets you assign datatypes to registers, monitor traffic in real-time, and simulate complex server behaviors.

## Download

**[Download the latest release](https://github.com/littepointR/modbus-slave/releases/latest)**

Available for Windows and macOS

**[Read the documentation](https://github.com/littepointR/modbus-slave/wiki)**

## Features

**Simulation Mode (Server-Only Focus):**

- **Multi-Slave Support**: Simulate multiple Unit IDs (0-255) on a single port or connection.
- **Protocol Versatility**: Support for Modbus TCP, RTU, UDP, ASCII, RTU-over-TCP, and RTU-over-UDP.
- **11 Data Types**: Read/write with int16/32/64, uint16/32/64, float, double, timestamps, and UTF-8 strings.
- **Traffic Monitoring**: Real-time packet interception (RX/TX) with millisecond timestamps and PDU parsing.
- **Value Generators**: Static values, random generation, or professional **Easing Functions** for dynamic data simulation.
- **Excel Integration**: Import/Export register mappings and data via Excel (.xlsx) files.
- **Scripting**: Built-in script editor for advanced dynamic response logic.
- **State Persistence**: Workspace-based management with automatic saving and "Unsaved Changes" protection.

## UI

![Modbus Slave Emulator UI](./resources/modbus-slave-client.png)

## Why This Exists

Built with Electron, React, and Material-UI. Open source because the industrial automation industry needs better, more modern tools.

## Tech Stack

- **Core**: Electron, Node.js
- **Frontend**: React 18, Material-UI (MUI v6), Zustand
- **Modbus**: modbus-serial, serialport
- **Styling**: Emotion, CSS Modules
- **Development**: Vite, TypeScript, Vitest, Playwright

## Installation

### Windows
Download the `.exe` file from releases.
⚠️ **SmartScreen warning**: Click "More info" → "Run anyway"

### macOS
Download the `.dmg` file from releases.
⚠️ **First time opening**: Right-click the app and select "Open"

## Build It Yourself

### Setup
```bash
git clone https://github.com/littepointR/modbus-slave.git
cd modbus-slave
yarn
```

### Development
```bash
yarn dev
```

### Testing
```bash
yarn test        # Unit tests
yarn test:e2e    # E2E tests (Playwright)
yarn checkup     # Full quality check
```

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
