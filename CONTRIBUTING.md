# Contributing to Mediator Node

Thank you for your interest in contributing to the NatLangChain Mediator Node! This document provides guidelines and information for contributors.

## Getting Started

1. **Read the documentation**: Familiarize yourself with the [Protocol Specification](spec.md) and the [Architecture Guide](ARCHITECTURE.md).
2. **Understand the architecture**: Mediator Node is part of the NatLangChain 12-repository ecosystem. See the spec.md for the full repository map.
3. **Set up your environment**: Follow the installation instructions in the [README](README.md).

## How to Contribute

### Reporting Issues

- Use GitHub Issues to report bugs or suggest features
- Search existing issues before creating a new one
- Provide clear reproduction steps for bugs
- Include relevant logs and environment information

### Code Contributions

1. **Fork the repository** and create a feature branch
2. **Follow existing code style** and patterns
3. **Write tests** for new functionality
4. **Update documentation** as needed
5. **Submit a Pull Request** with a clear description

### Documentation Contributions

- Improvements to existing docs are welcome
- New documentation should align with the MP (Mediator Protocol) specifications
- Use clear, precise language

## NCIP Process

For significant changes to protocol semantics or governance:

1. **Read NCIP-000** (Terminology & Semantics Governance) in the main NatLangChain repo
2. **Check NCIP-014** (Protocol Amendments & Constitutional Change)
3. **Draft an NCIP** following the established format
4. **Submit for review** via Pull Request

### NCIP Guidelines

- NCIPs cannot redefine semantics established by lower-numbered NCIPs
- New terms must avoid collision with existing canonical terms
- Changes require explicit backward-compatibility analysis

## Code Standards

### TypeScript

- Follow existing code style and patterns
- Use TypeScript strict mode
- Write type definitions for public interfaces
- Keep functions focused and testable
- Add JSDoc comments for public APIs

### Testing

- Write unit tests for new functionality
- Ensure all tests pass before submitting (`npm test`)
- Include integration tests for API changes

### Documentation

- Use Markdown format
- Follow existing document structure
- Reference MP specifications where applicable
- Keep language precise and unambiguous

## Pull Request Process

1. **Ensure all tests pass** before submitting
2. **Update spec.md** if your change affects the specification
3. **Reference related issues** in your PR description
4. **Request review** from maintainers
5. **Address feedback** promptly

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] spec.md updated (if applicable)
- [ ] No breaking changes (or clearly documented)
- [ ] Follows NCIP governance (for semantic changes)

## Governance

NatLangChain uses a layered governance model:

- **NCIP Framework**: Semantic and protocol governance
- **MP Suite**: Mediator Protocol specifications (MP-01 through MP-06)
- **Technical Specification**: Implementation details (spec.md)

## Community

- Be respectful and constructive
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)
- Help others learn and contribute

## License

By contributing, you agree that your contributions will be licensed under the project's MIT license.

---

**Questions?** Open an issue or consult the [FAQ](FAQ.md).

**Last Updated:** December 24, 2025
