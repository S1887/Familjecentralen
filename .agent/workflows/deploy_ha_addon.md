---
description: How to deploy the Family Ops Home Assistant Add-on
---

# Deploy Family Ops HA Add-on

Follow these steps to deploy a new version of the Family Ops application to GitHub, ensuring Home Assistant detects the update.

## Version Files to Update

> [!CAUTION]
> **You MUST update BOTH config files, or HA will NOT detect the update!**

1. **`package.json`** (line 4) - App version
2. **`config.yaml`** (line 2) - Root config (backup)
3. **`familjecentralen/config.yaml`** (line 2) - **THIS IS THE ONE HA READS!** 🚨

## Steps

// turbo-all

1. **Bump Version in `package.json`**
   ```bash
   # In family-ops/package.json, line 4:
   "version": "X.Y.Z"
   ```

2. **Bump Version in `config.yaml`** (root)
   ```bash
   # In family-ops/config.yaml, line 2:
   version: "X.Y.Z"
   ```

3. **Bump Version in `familjecentralen/config.yaml`** (CRITICAL!)
   ```bash
   # In family-ops/familjecentralen/config.yaml, line 2:
   version: "X.Y.Z"
   ```
   *This is the actual file HA reads from the add-on subfolder!*

4. **Commit and Push**
   ```bash
   cd family-ops
   git add .
   git commit -m "v[VERSION]: [Description]"
   git push origin main
   ```

5. **Verify in HA**
   - Go to Add-ons Store → Check for updates
   - If not showing, try: Supervisor → System → Reload Supervisor
