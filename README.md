# Synthetic Selection: Blockbench Plugin

Sync your Blockbench models directly into the Synthetic Selection engine in real-time.

## 1. Install Plugin
1. Download `synthetic_selection.js`.
2. In Blockbench, go to **File > Plugins...**
3. Click the **Load Plugin from File** icon (top right) and select the file.

## 2. Get Your Token
1. Open Synthetic Selection and press **F10** to open Settings.
2. Go to the **Connections** tab.
3. Enable the **Blockbench Server** and click **Generate** next to Token.
4. Click **Copy**.

## 3. Connect & Sync
1. In Blockbench, go to **Tools > Connect to Synthetic Selection**.
2. Paste your token and hit **Confirm**.
3. With a model open, go to **Tools > Sync to Game** (or press `Ctrl+Alt+S`).
4. Your model will instantly update in the game's editor!

> [!WARNING]
> **Overwrite Behavior**
> When you sync a model from Blockbench, it uses the current project name. This will permanently overwrite any existing model in Synthetic Selection that shares the exact same name. Always ensure your Blockbench project is named correctly before syncing.
