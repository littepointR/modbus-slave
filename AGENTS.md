# Modbux AGENTS.md

Coding guidelines for AI agents working on the Modbux Electron + React project.

## Tech Stack

- **Framework**: Electron 32 + React 18 + TypeScript 5
- **UI**: Material-UI (MUI) v6 + Emotion
- **State**: Zustand + zustand-mutative
- **Build**: electron-vite + electron-builder
- **Testing**: Vitest (unit) + Playwright (E2E)
- **Package Manager**: Yarn 4

## Build Commands

```bash
# Development
yarn dev                    # Start dev server

# Production Build
yarn build                  # Build all (runs typecheck + electron-vite build)
yarn build:mac             # Build macOS DMG
yarn build:win             # Build Windows installer
yarn build:linux           # Build Linux packages

# Testing
yarn test                   # Run unit tests (Vitest once)
yarn test:watch            # Run unit tests (watch mode)
yarn test:e2e              # Run E2E tests (Playwright)

# Single test file
yarn vitest run src/path/to/file.test.ts
yarn vitest run --reporter=verbose src/path/to/file.test.ts

# Code Quality
yarn lint                   # ESLint fix
yarn format                 # Prettier format all
yarn typecheck             # TypeScript check (node + web)
```

## Code Style

### Formatting (Prettier)
- Single quotes, no semicolons, printWidth: 100
- No trailing commas
- End of line: auto

### Naming Conventions
- **Components**: PascalCase (e.g., `LanguageSwitcher.tsx`)
- **Files**: kebab-case for non-component files
- **Hooks**: `useXxxZustand` pattern (e.g., `useLayoutZustand`)
- **Types**: Suffix with `.types.ts` (e.g., `layout.zustand.types.ts`)
- **Tests**: `*.spec.ts` suffix

### Import Order
1. React/Node built-ins
2. Third-party libraries
3. Path aliases (@renderer, @main, @shared, etc.)
4. Relative imports

### Path Aliases
- `@renderer/*` → `src/renderer/src/*`
- `@main` → `src/main`
- `@preload` → `src/preload`
- `@shared` → `src/shared`
- `@backend` → `src/backend`

## Project Structure

```
src/
  main/           # Electron main process (Node.js)
    modules/      # Modbus client/server logic
    ipc.ts        # IPC handlers
    state.ts      # App state
  preload/        # Preload scripts
  renderer/src/   # React app
    components/   # React components
      client/     # Client-specific
      server/     # Server-specific
      shared/     # Shared components
    containers/   # Page-level containers
    context/      # Zustand stores
    hooks/        # Custom React hooks
  shared/         # Shared types/utils
e2e/              # Playwright E2E tests
```

## React Patterns

### Component Structure
```tsx
// Functional components with explicit JSX.Element return
const ComponentName = (): JSX.Element => {
  // hooks first
  const state = useZustandStore()
  
  // handlers
  const handleClick = () => {}
  
  return <Box>...</Box>
}

export default ComponentName
```

### State Management (Zustand)
- Use zustand-mutative for immutable updates
- Store files: `*.zustand.ts`
- Type files: `*.zustand.types.ts`
- Helper files: `*.zustand.helpers.ts`

### MUI Styling
- Use `sx` prop for inline styles
- Use styled components for reusable styles
- Theme access via `useTheme()` hook

## Testing Guidelines

### Unit Tests (Vitest)
- Co-locate tests with source or in `__tests__/` folder
- Use `@testing-library/react` for component tests
- Mock external dependencies

### E2E Tests (Playwright)
- All E2E tests in `e2e/` folder
- Use `data-testid` attributes for selectors
- Follow existing test patterns in `e2e/app.spec.ts`

### Required Verification Matrix (Current)
- Always run full unit tests before commit: `yarn test`
- Always run full E2E before commit: `yarn test:e2e`
- Keep communication-focused flows covered by:
  - `e2e/protocol-config.spec.ts`
  - `e2e/register-types.spec.ts`
  - `e2e/smoke-and-comm.spec.ts`
  - `e2e/user-journey.spec.ts`
- For communication backend changes, add/maintain tests under:
  - `src/main/modules/__tests__/serverAdapter.test.ts`
  - `src/main/modules/__tests__/trafficMonitor.test.ts`

### Known Local Lint Caveat
- In nested worktree setups, `yarn lint` may fail with duplicated `eslint-plugin-react-hooks` resolution from parent + child configs.
- This is an environment/config issue; do not block functional verification on this error when `yarn test` and `yarn test:e2e` are green.

## Error Handling

- Use Zod for runtime validation
- Use notistack for user-facing notifications
- Log errors to console in dev, silently fail gracefully in prod

## TypeScript

- Strict mode enabled
- No `any` types without explicit justification
- Prefer interfaces over type aliases for object shapes
- Use discriminated unions for complex state

## Git Workflow

- Main branch: `main`
- Feature branches: `feature/description`
- Atomic commits with clear messages
- No AI slop - code should look hand-written
