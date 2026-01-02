---
description: How to deploy the Family Ops Home Assistant Add-on
---

# Deploy Family Ops HA Add-on

Follow these steps to deploy a new version of the Family Ops application to GitHub, ensuring Home Assistant detects the update.

1. **Bump Version in `package.json`**
   - Open `family-ops/package.json`
   - Increment the `version` field (e.g., `3.4.1` -> `3.4.2`)

2. **Bump Version in `config.yaml`** (CRITICAL!)
   - Open `family-ops/config.yaml`
   - Increment the `version` field to MATCH `package.json`
   - *Note: If this step is missed, Home Assistant will NOT see the update.*

3. **Commit and Push**
   - Run the following terminal commands:
   ```bash
   cd family-ops
   git add .
   git commit -m "v[NEW_VERSION]: [Description of changes]"
   git push origin main
   ```

4. **Verify Deployment**
   - Check GitHub Actions or simply wait for the push to complete.
   - In Home Assistant: Go to Add-ons Store -> Check for updates.
