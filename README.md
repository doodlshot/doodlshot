# ✏️ Doodlshot

> **Ultra-fast screenshot annotation tool with hand-drawn styling and bendable arrows.**  
> Built for Linux & Wayland (CachyOS, Hyprland, Arch, GNOME, etc.).

---

## ✨ Features

* **🏹 Bendable Curved Arrows**: Click and drag to create an arrow, then simply grab the center handle to bend it into a smooth, organic arc.
* **✍️ Hand-Drawn "Rough" Styling**: Wobbly ovals, sketchy rectangles, and clouds with dual-stroke jitter for that warm, human touch.
* **🔤 Playful Typography**: Text annotations rendered in the informal, bouncy *Shantell Sans* font.
* **⬛ Pixelate / Redact Tool**: Drag a box over passwords, tokens, or sensitive data to instantly pixelate them.
* **📋 Frictionless Clipboard Workflow**: Press `Ctrl+C` or `Enter` to copy high-resolution PNGs directly to your Wayland clipboard (`wl-copy`) and close immediately.
* **⚡ Blazing Fast**: Native Wayland screen capture (`grim + slurp`) and hardware-accelerated canvas launch.

---

## 🚀 Quick Start

### Prerequisites
Make sure you have `grim`, `slurp`, and `wl-copy` installed on your Wayland system:
```bash
sudo pacman -S grim slurp wl-clipboard
```

### Running Doodlshot

1. **Capture an area on your screen**:
   ```bash
   ./doodlshot
   ```
2. **Open an existing image**:
   ```bash
   ./doodlshot /path/to/screenshot.png
   ```

---

## ⌨️ Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`A`** | Bendable Arrow tool |
| **`O`** | Hand-drawn Oval / Circle tool |
| **`R`** | Hand-drawn Rectangle tool |
| **`C`** | Hand-drawn Cloud tool |
| **`T`** | Text tool (*Shantell Sans*) |
| **`P`** | Freehand Pen tool |
| **`X`** | Pixelate / Redact tool |
| **`V`** | Select / Move / Bend handle tool |
| **`Ctrl + C`** / **`Enter`** | **Copy to clipboard and close** |
| **`Ctrl + S`** | **Save to `~/Pictures/Screenshots` and close** |
| **`Ctrl + Z`** | Undo last annotation |
| **`Delete` / `Backspace`** | Delete selected annotation |
| **`Escape`** | Cancel and close |

---

## 🖥️ Hyprland Keybind Integration

To bind Doodlshot to your **Print** key:

### If using Noctalia desktop shell (`~/.config/noctalia/config.toml`):
```toml
[shell.screenshot]
pipe_command = "/home/nirmal/Projects/doodlshot/doodlshot -"
```

### Direct Hyprland bind (`~/.config/hypr/hyprland.conf` or `binds.lua`):
```lua
bind = , Print, exec, /home/nirmal/Projects/doodlshot/doodlshot
```

---

## 📄 License
MIT License. Feel free to use, modify, and build upon.
