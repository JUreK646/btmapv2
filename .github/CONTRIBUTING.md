# Contributing to BTMap

Thank you for your interest in contributing to **BTMap v2**! BTMap is a community-driven, open-source platform dedicated to cellular base station mapping (BTS), UKE regulatory registry synchronization, and environmental RF field (SI2PEM) data transparency.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Station Discrepancies](#reporting-station-discrepancies)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Code Contributions](#code-contributions)
- [Local Development Setup](#local-development-setup)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)

---

## Code of Conduct
Please review our [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project, you agree to abide by its terms.

---

## How Can I Contribute?

### Reporting Station Discrepancies
If you notice missing BTS permits, incorrect antennas, inaccurate GPS coordinates, or unlisted cell identifiers, please open an issue using the **Cell / Station Data Correction** template.

### Reporting Bugs
Bugs can be reported via GitHub Issues using the **Bug Report** template. Please include:
- A clear description of the problem.
- Steps to reproduce.
- Browser name, version, and OS.
- Any relevant console logs or screenshots.

### Suggesting Features
Ideas for UI improvements, RF calculators, coverage estimators, or additional data integrations are welcome! Please open a **Feature Request** issue.

---

## Local Development Setup

### Prerequisites
- **Node.js**: `>= 24.0.0`
- **pnpm**: `>= 9.0.0` (or `npm`)
- **Python**: `>= 3.10` (for auxiliary KML scripts, optional)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/JUreK646/btmapv2.git
   cd btmapv2
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start development server (API + Vite):
   ```bash
   pnpm run dev
   ```
   Open `http://localhost:5174` in your browser.

4. Run type check and verify build:
   ```bash
   pnpm run typecheck
   pnpm run build
   ```

---

## Commit Message Guidelines
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat: ...` for new features or data capabilities
- `fix: ...` for bug fixes
- `docs: ...` for documentation changes
- `refactor: ...` for code refactoring without functional changes
- `chore: ...` for dependency updates or build tooling changes

---

## Pull Request Process

1. Fork the repo and create your feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Commit your changes following Conventional Commits.
3. Ensure TypeScript type check passes:
   ```bash
   pnpm run typecheck
   ```
4. Push to your branch and open a Pull Request targeting the `develop` branch.
5. Provide a clear description in the PR template.
