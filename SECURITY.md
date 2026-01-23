# Security Policy

## Supported Versions

The following versions of NatLangChain Mediator Node are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of NatLangChain Mediator Node seriously. If you discover a security vulnerability, please follow these guidelines:

### How to Report

1. **Do NOT disclose the vulnerability publicly** until it has been addressed
2. **Email**: Send details to [kase1111@gmail.com](mailto:kase1111@gmail.com)
3. **Subject line**: Use "SECURITY: [Brief Description]"

### What to Include

Please provide as much information as possible:

- Type of vulnerability (e.g., injection, authentication bypass, data exposure)
- Location of the affected source code (file path, line numbers if known)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if available)
- Impact assessment
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 7 days
- **Status updates**: Every 7 days until resolution
- **Fix release**: Depends on severity (critical: ASAP, high: 14 days, medium: 30 days)

### What to Expect

1. **Acknowledgment**: We will confirm receipt of your report
2. **Assessment**: We will investigate and validate the vulnerability
3. **Communication**: We will keep you informed of our progress
4. **Fix**: We will develop and test a fix
5. **Credit**: With your permission, we will credit you in the release notes

## Security Best Practices

When running a Mediator Node, please follow these security recommendations:

### API Key Protection

- Never commit API keys to version control
- Use environment variables or secrets management
- Rotate keys periodically
- Use separate keys for development and production

### Network Security

- Run behind a reverse proxy in production
- Enable TLS/HTTPS for all connections
- Configure firewall rules appropriately
- Use VPN for sensitive deployments

### Node Configuration

- Keep dependencies updated (`npm audit`)
- Run with minimal required permissions
- Enable rate limiting
- Monitor logs for suspicious activity

### LLM Security

- Enable prompt injection protection (enabled by default)
- Review and test custom prompts before deployment
- Monitor for unusual LLM responses
- Set appropriate request limits

## Security Features

The Mediator Node includes several built-in security features:

- **Input validation**: Zod schema validation on all inputs
- **Rate limiting**: Configurable request rate limits
- **Prompt security**: 45+ prompt injection detection patterns
- **HTTP security headers**: Via Helmet middleware
- **Automated scanning**: Built-in vulnerability scanner

### External Security Integrations

For enhanced security, consider integrating with:

- **[Boundary Daemon](https://github.com/kase1111-hash/boundary-daemon-)**: Policy enforcement and audit logging
- **[Boundary SIEM](https://github.com/kase1111-hash/Boundary-SIEM)**: Security event management and threat detection

See [Security Hardening Guide](./docs/SECURITY_HARDENING.md) for detailed configuration.

## Vulnerability Disclosure Policy

We follow a responsible disclosure policy:

1. Reporter contacts us privately
2. We acknowledge and investigate
3. We develop and test a fix
4. We release the fix
5. We publicly disclose the vulnerability (after fix is available)
6. Reporter may publish their findings (coordinated with us)

## Security Hall of Fame

We thank the following individuals for responsibly disclosing security vulnerabilities:

*No entries yet - be the first!*

---

Thank you for helping keep NatLangChain Mediator Node secure.
