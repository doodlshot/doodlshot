#!/usr/bin/env python3
"""
Doodlshot: Ultra-fast screenshot annotation tool with hand-drawn styling and bendable arrows.
"""

import sys
import os
import base64
import json
import subprocess
import tempfile
import datetime
from pathlib import Path

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('WebKit', '6.0')
from gi.repository import Gtk, WebKit, GLib, Gio


def capture_screenshot():
    """Captures a region of the screen using grim and slurp on Wayland."""
    tmp_path = tempfile.mktemp(suffix=".png", prefix="doodlshot_")
    try:
        # Prompt user to select region with slurp
        slurp_proc = subprocess.run(["slurp"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if slurp_proc.returncode != 0 or not slurp_proc.stdout.strip():
            sys.exit(0) # Cancelled by user
        
        region = slurp_proc.stdout.strip()
        grim_proc = subprocess.run(["grim", "-g", region, tmp_path], check=True)
        return tmp_path
    except FileNotFoundError:
        print("Error: grim or slurp not found. Please install them to capture screenshots.", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Capture failed: {e}", file=sys.stderr)
        return None


class DoodlshotApp:
    def __init__(self, image_path=None, image_data=None):
        self.image_path = image_path
        self.image_data = image_data
        self.app = Gtk.Application(application_id="dev.doodlshot.app", flags=Gio.ApplicationFlags.FLAGS_NONE)
        self.app.connect("activate", self.on_activate)
        self.win = None

    def run(self):
        return self.app.run(None)

    def on_activate(self, app):
        self.win = Gtk.ApplicationWindow(application=app)
        self.win.set_title("Doodlshot")
        self.win.set_default_size(1100, 750)

        web = WebKit.WebView()
        settings = web.get_settings()
        settings.set_enable_developer_extras(False)
        settings.set_enable_javascript(True)

        # Setup bridge for JS -> Python communication
        ucm = web.get_user_content_manager()
        ucm.register_script_message_handler("doodlshot")
        ucm.connect("script-message-received::doodlshot", self.on_js_message)

        # Load HTML
        src_dir = Path(__file__).parent.resolve()
        html_file = src_dir / "index.html"
        
        with open(html_file, "r", encoding="utf-8") as f:
            html_content = f.read()

        # Prepare image data URI
        data_uri = None
        if self.image_data:
            b64 = base64.b64encode(self.image_data).decode("utf-8")
            data_uri = f"data:image/png;base64,{b64}"
        elif self.image_path and os.path.exists(self.image_path):
            with open(self.image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
                data_uri = f"data:image/png;base64,{b64}"

        if data_uri:
            injection = f"<script>window.INITIAL_IMAGE_DATA = '{data_uri}';</script></head>"
            html_content = html_content.replace("</head>", injection, 1)

        base_uri = f"file://{html_file}"
        web.load_html(html_content, base_uri)

        self.win.set_child(web)
        self.win.present()

    def on_js_message(self, ucm, js_result):
        try:
            raw = js_result.to_json(0)
            msg = json.loads(raw)
            action = msg.get("action")
            data = msg.get("data")

            if action == "copy" and data:
                # data is data:image/png;base64,...
                if "," in data:
                    b64_data = data.split(",", 1)[1]
                    png_bytes = base64.b64decode(b64_data)
                    # Pipe to wl-copy
                    subprocess.run(["wl-copy", "--type", "image/png"], input=png_bytes, check=True)
                    subprocess.run(["notify-send", "-a", "Doodlshot", "Doodlshot", "Annotated screenshot copied to clipboard!"])
                self.app.quit()

            elif action == "copy_text" and data:
                text = str(data).strip()
                try:
                    subprocess.run(["wl-copy"], input=text.encode("utf-8"), check=True)
                except Exception as ex:
                    print(f"wl-copy text error: {ex}", file=sys.stderr)

            elif action == "save" and data:
                if "," in data:
                    b64_data = data.split(",", 1)[1]
                    png_bytes = base64.b64decode(b64_data)
                    save_dir = Path.home() / "Pictures" / "Screenshots"
                    save_dir.mkdir(parents=True, exist_ok=True)
                    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    out_file = save_dir / f"Doodlshot_{ts}.png"
                    with open(out_file, "wb") as f:
                        f.write(png_bytes)
                    subprocess.run(["notify-send", "-a", "Doodlshot", "Doodlshot Saved", f"Saved to {out_file}"])
                self.app.quit()

            elif action == "exit":
                self.app.quit()

        except Exception as e:
            print(f"Error handling message: {e}", file=sys.stderr)
            self.app.quit()


def main():
    image_path = None
    image_data = None

    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "-f" and len(sys.argv) > 2:
            arg = sys.argv[2]

        if arg == "-":
            # Reading from stdin (e.g. noctalia piping)
            image_data = sys.stdin.buffer.read()
        elif os.path.exists(arg):
            image_path = arg
        elif arg == "--capture":
            image_path = capture_screenshot()
    else:
        # If no arguments provided, test or capture
        # If running from a terminal without args, capture region
        image_path = capture_screenshot()

    app = DoodlshotApp(image_path=image_path, image_data=image_data)
    sys.exit(app.run())


if __name__ == "__main__":
    main()
