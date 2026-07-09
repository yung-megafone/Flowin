# Tools

This directory contains the standalone utilities that make up the **Flowin Operations Suite (FOS)**.

Each tool is self-contained and organized by category. Individual tools include their own documentation under `docs/tools/`.

---

## Categories

### Browser Userscripts

Small browser enhancements designed to simplify repetitive tasks within supported web applications.

| Tool | Status | Description |
|------|--------|-------------|
| **ClipIt** | Stable | Adds quick-copy functionality for ticket sharing and documentation workflows. |

**Location**

```text
browser-userscripts/
└── clipit/
```

---

### Web Applications

Standalone browser applications that require no installation or server infrastructure.

| Tool | Status | Description |
|------|--------|-------------|
| **IBCL (Inbound Carton Loss)** | Active Development | Desktop-style operations dashboard for downtime tracking, carton loss estimation, throughput monitoring, and shift projections. |

**Location**

```text
web-apps/
└── carton-loss-tracker/
```

---

### Python Utilities

Reserved for future standalone Python-based utilities.

```text
python/
```

---

### Spreadsheets

Reserved for spreadsheet-based operational tools and templates.

```text
spreadsheets/
```

---

# Design Philosophy

Every Flowin tool is designed to be:

- **Portable** — Easy to deploy and use.
- **Modular** — Independent from other tools.
- **Client-side** where practical.
- **Focused** — One tool, one primary purpose.

---

# Documentation

Detailed documentation for each tool is available under:

```text
docs/
└── tools/
```

For release history, see:

```text
docs/
└── releases/
```