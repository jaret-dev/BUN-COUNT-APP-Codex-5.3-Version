# BUN COUNT Web App

This repository hosts a lightweight, static MVP for Harvey's Bun Count & Ordering dashboard based on the v1.2 technical specification.

## Quick Start

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Features

- Daily End-of-Day Count entry with automatic MC/IST/USED calculations.
- 14-day rolling inventory view.
- Order generator that applies lead-time rules, delivery-day mapping, and product increments.
- Local storage persistence for inventory and orders.
