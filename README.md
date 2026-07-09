<div align="center">

# Flowin Operations Suite (FOS)

### Lightweight productivity tools for Inbound Flow Process Guides

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Browser%20%7C%20Userscripts-orange)
![Status](https://img.shields.io/badge/status-Active%20Development-brightgreen)
![Languages](https://img.shields.io/badge/languages-English%20%7C%20Español%20%7C%20Ελληνικά-purple)
![Client Side](https://img.shields.io/badge/client--side-100%25-success)

*"Helping Process Guides spend less time calculating and more time improving their flow."*

</div>

---

# Overview

Flowin Operations Suite (FOS) is a collection of lightweight productivity tools developed to reduce repetitive work, improve operational awareness, and streamline common workflows performed by Inbound Flow Process Guides.

Each tool is designed around four guiding principles:

- **Portable** — Runs with little or no installation.
- **Private** — Data remains local unless the user explicitly exports it.
- **Practical** — Built around real operational workflows.
- **Modular** — Every utility is independent while sharing a common design philosophy.

Flowin is an ongoing personal project and continues to evolve as new operational needs are identified.

---

# Current Modules

| Module | Type | Status | Purpose |
|---------|------|--------|---------|
| **IBCL (Inbound Carton Loss)** | Standalone Web Application | Active Development | Track downtime events, estimate carton loss, monitor throughput, and visualize shift performance. |
| **ClipIt** | Browser Userscript | Stable | Adds quick-copy functionality for ticket sharing and documentation workflows. |

---

# Repository Structure

```text
Flowin/
│
├── docs/
│   ├── tools/
│   └── releases/
│
├── tools/
│   ├── browser-userscripts/
│   │   └── clipit/
│   │
│   ├── web-apps/
│   │   └── carton-loss-tracker/
│   │
│   ├── python/
│   └── spreadsheets/
│
├── CHANGELOG.md
├── LICENSE
└── README.md
```

---

# Included Applications

## IBCL (Inbound Carton Loss)

Originally created as a simple downtime calculator, IBCL has grown into a desktop-style operational dashboard featuring:

- Desktop workspace
- Draggable & resizable cards
- Pop-out windows
- Multi-monitor support
- Historical downtime tracking
- Throughput projections
- Export framework
- Workspace persistence
- Dark mode
- Localization
- Modular architecture

📖 Documentation: `docs/tools/IBCL.md`

---

## ClipIt

ClipIt is a lightweight browser userscript that streamlines ticket sharing and documentation by providing quick-copy functionality directly from supported web pages.

📖 Documentation: `docs/tools/ClipIt.md`

---

# Installation

## Browser Applications

Standalone HTML applications require no installation.

Simply download the application and open it in a modern web browser.

Most browser-based applications store user preferences and session data locally using the browser's Local Storage API.

---

## Userscripts

1. Install a userscript manager such as **Tampermonkey** (recommended).
2. Import the desired `.user.js` file.
3. Enable the script.
4. Refresh the supported webpage.

---

# Documentation

| Document | Description |
|----------|-------------|
| `docs/tools/IBCL.md` | IBCL technical documentation |
| `docs/tools/ClipIt.md` | ClipIt documentation |
| `CHANGELOG.md` | Project history |
| `docs/releases/` | Release notes |
| `LICENSE` | License information |

---

# Adding a New Tool

Flowin follows a modular structure.

Typical layout:

```text
tools/
├── browser-userscripts/<tool>/
├── web-apps/<tool>/
├── python/<tool>/
└── spreadsheets/<tool>/
```

Each module should include:

- Source files
- Documentation (`docs/tools/`)
- Release notes (when applicable)

---

# Privacy & Security

Flowin applications are intentionally designed to operate entirely on the client.

The projects do **not**:

- transmit operational information
- upload user data
- require accounts
- include telemetry or analytics
- depend on external services for normal operation

Information leaves the application only when the user explicitly chooses to export or copy it.

---

# Confidentiality & Compliance

This repository contains independently developed productivity tools intended to assist with personal workflows.

It **does not** contain:

- proprietary documentation
- authentication credentials
- API keys
- confidential datasets
- internal source code
- trade secrets
- embedded operational endpoints

Where operational calculations are used, they are generalized estimation methods derived from user-provided information and publicly observable workflows. The repository is not intended to disclose or reproduce confidential operational processes.

If any material is believed to have been included in error or raises confidentiality concerns, please contact me through the appropriate official channels. Upon verification, the material will be reviewed and, if necessary, removed.

---

# Disclaimer

Flowin Operations Suite is an independent personal software project.

It is **not affiliated with, endorsed by, or supported by Amazon** or any other employer.

Users are responsible for ensuring that their use of these tools complies with their employer's policies, confidentiality obligations, and applicable laws.

---

# License

Released under the **MIT License**.

See the accompanying `LICENSE` file for details.

---

<div align="center">

### Built by operators, for operators.

⭐ If you find the project useful, consider starring the repository :)

</div>