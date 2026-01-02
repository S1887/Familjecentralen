# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

## 🚨 DEPLOYMENT REMINDER (For AI Assistants & Developers)

When deploying a new version to Home Assistant, you **MUST** update **ALL THREE** version files:

| File | Line | Purpose |
|------|------|---------|
| `package.json` | 4 | App version |
| `config.yaml` (root) | 2 | Backup config |
| `familjecentralen/config.yaml` | 2 | **⚠️ THIS IS THE ONE HA READS!** |

> **If `familjecentralen/config.yaml` is not updated, Home Assistant will NOT detect the update!**

See `.agent/workflows/deploy_ha_addon.md` for full deployment steps.
