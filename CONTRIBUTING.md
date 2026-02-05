# Contributing to Auth Template

## Welcome!

Thank you for considering contributing to this project!

## How to Contribute

### 1. Fork & Clone
```bash
git clone https://github.com/a7medsa22/payment-gateway.git
cd payment-gateway
```

### 2. Create Branch
```bash
git checkout -b feature/my-feature
```

### 3. Make Changes

- Follow existing code style
- Add tests for new features
- Update documentation

### 4. Test
```bash
pnpm test
pnpm test:e2e
pnpm lint
```

### 5. Commit
```bash
git commit -m "feat: add amazing feature"
```

Use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring

### 6. Push & PR
```bash
git push origin feature/my-feature
```

Then open a Pull Request!

## Code Style

- TypeScript strict mode
- ESLint + Prettier
- No `any` types
- Meaningful variable names

## Testing

- Unit tests for domain logic
- Integration tests for use cases
- E2E tests for API endpoints

## Documentation

- Update README if needed
- Add JSDoc for public APIs
- Update ADRs for major decisions

## Questions?

Open an issue or join our Discord!