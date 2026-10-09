#!/usr/bin/env python3
"""
Wayland screen recorder module for Doodlshot using wf-recorder and ffmpeg.
Optimized for lightweight, shareable H.264 MP4 videos (<5MB) and animated GIFs.
"""

import sys
import os
from pathlib import Path

# Disable WebKit bubblewrap sandbox so the media process can access local recordings directly
os.environ["WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS"] = "1"

import time
import json
import signal
import datetime
import threading
import subprocess

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('WebKit', '6.0')
from gi.repository import Gtk, Gdk, GLib, Gio, WebKit

PID_FILE = Path("/tmp/doodlshot_recording.json")
DEFAULT_RECORDINGS_DIR = Path.home() / "Videos" / "Recordings"


def sanitize_geometry(geom_str):
    """Ensures width and height are even numbers (required by H.264 encoders)."""
    if not geom_str:
        return None
    try:
        parts = geom_str.strip().split()
        if len(parts) == 2:
            coord, dims = parts
            x, y = coord.split(",")
            w, h = dims.split("x")
            w_int = int(w)
            h_int = int(h)
            if w_int % 2 != 0:
                w_int -= 1
            if h_int % 2 != 0:
                h_int -= 1
            w_int = max(2, w_int)
            h_int = max(2, h_int)
            return f"{x},{y} {w_int}x{h_int}"
    except Exception:
        pass
    return geom_str.strip()


def is_recording():
    """Checks if a recording is currently in progress and the process is alive."""
    if not PID_FILE.exists():
        return False
    try:
        data = json.loads(PID_FILE.read_text(encoding="utf-8"))
        pid = data.get("pid")
        if pid and os.path.exists(f"/proc/{pid}"):
            return True
    except Exception:
        pass
    return False


def get_recording_info():
    """Returns data dictionary from the current recording PID file if available."""
    if PID_FILE.exists():
        try:
            return json.loads(PID_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None


def stop_recording():
    """Stops any active recording process gracefully and cleans up the PID file."""
    info = get_recording_info()
    if not info:
        return None

    pid = info.get("pid")
    video_file = info.get("file")

    if pid and os.path.exists(f"/proc/{pid}"):
        try:
            os.kill(pid, signal.SIGINT)
            for _ in range(40):
                if not os.path.exists(f"/proc/{pid}"):
                    break
                time.sleep(0.1)
        except ProcessLookupError:
            pass

    if PID_FILE.exists():
        try:
            PID_FILE.unlink()
        except Exception:
            pass

    return video_file if (video_file and os.path.exists(video_file)) else None


def probe_video_stats(video_path):
    """Extracts width, height, duration, and file size for a video."""
    stats = {
        "width": 1920,
        "height": 1080,
        "duration": 0.0,
        "size_mb": 0.0,
        "file": str(video_path),
        "filename": Path(video_path).name
    }
    try:
        if os.path.exists(video_path):
            stats["size_mb"] = round(os.path.getsize(video_path) / (1024 * 1024), 2)
            cmd = [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height,duration:format=duration",
                "-of", "json", str(video_path)
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode == 0 and res.stdout:
                data = json.loads(res.stdout)
                streams = data.get("streams", [])
                if streams:
                    s = streams[0]
                    stats["width"] = s.get("width", 1920)
                    stats["height"] = s.get("height", 1080)
                    dur = s.get("duration") or data.get("format", {}).get("duration")
                    if dur:
                        stats["duration"] = round(float(dur), 1)
                elif "format" in data:
                    dur = data["format"].get("duration")
                    if dur:
                        stats["duration"] = round(float(dur), 1)
    except Exception as ex:
        print(f"ffprobe error: {ex}", file=sys.stderr)
    return stats


def copy_video_to_clipboard(video_path):
    """Copies video file to Wayland clipboard as URI list for instant paste into Slack, Discord, chat, etc."""
    try:
        uri = f"file://{os.path.abspath(video_path)}\r\n"
        subprocess.run(["wl-copy", "-t", "text/uri-list"], input=uri.encode("utf-8"), check=True)
        return True
    except Exception as ex:
        print(f"wl-copy error: {ex}", file=sys.stderr)
        return False


def convert_to_gif(video_path):
    """Converts MP4 to high quality palette-generated GIF and copies to clipboard."""
    p = Path(video_path)
    gif_path = p.with_suffix(".gif")
    try:
        cmd = [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vf", "fps=15,scale='min(1280,iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
            str(gif_path)
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        if gif_path.exists():
            uri = f"file://{gif_path.resolve()}\r\n"
            subprocess.run(["wl-copy", "-t", "text/uri-list"], input=uri.encode("utf-8"), check=True)
            try:
                with open(gif_path, "rb") as gf:
                    subprocess.run(["wl-copy", "-t", "image/gif"], input=gf.read())
            except Exception:
                pass
            subprocess.run(["notify-send", "-a", "Doodlshot", "GIF Created", f"Copied {gif_path.name} to clipboard!"])
            return str(gif_path)
    except Exception as ex:
        print(f"GIF conversion error: {ex}", file=sys.stderr)
    return None


class VideoShareWindow(Gtk.ApplicationWindow):
    def __init__(self, app, video_path):
        super().__init__(application=app, title="Doodlshot Recording Dialog")
        self.set_default_size(860, 580)
        self.video_path = video_path

        # Dynamically reinforce Hyprland floating and centering rules
        try:
            subprocess.run(["hyprctl", "keyword", "windowrulev2", "float,title:^(Doodlshot Recording Dialog)$"], capture_output=True)
            subprocess.run(["hyprctl", "keyword", "windowrulev2", "center,title:^(Doodlshot Recording Dialog)$"], capture_output=True)
        except Exception:
            pass

        self.web = WebKit.WebView()
        settings = self.web.get_settings()
        settings.set_enable_javascript(True)
        settings.set_media_playback_requires_user_gesture(False)
        settings.set_media_playback_allows_inline(True)
        settings.set_allow_file_access_from_file_urls(True)
        settings.set_allow_universal_access_from_file_urls(True)

        ucm = self.web.get_user_content_manager()
        ucm.register_script_message_handler("doodlshot_video")
        ucm.connect("script-message-received::doodlshot_video", self.on_js_message)

        src_dir = Path(__file__).parent.resolve()
        html_file = src_dir / "video_player.html"
        base_uri = f"file://{html_file}"

        with open(html_file, "r", encoding="utf-8") as f:
            html_content = f.read()

        stats = probe_video_stats(video_path)
        injection = f"<script>window.addEventListener('DOMContentLoaded', () => window.initVideo({json.dumps(stats)}));</script></head>"
        html_content = html_content.replace("</head>", injection, 1)

        self.web.load_html(html_content, base_uri)
        self.set_child(self.web)

    def on_js_message(self, ucm, js_result):
        try:
            raw = js_result.to_json(0)
            msg = json.loads(raw)
            action = msg.get("action")
            data = msg.get("data")

            if action == "copy_video":
                copy_video_to_clipboard(self.video_path)
            elif action == "open_folder":
                parent = str(Path(self.video_path).parent)
                subprocess.run(["xdg-open", parent])
            elif action == "make_gif":
                def do_gif():
                    gif = convert_to_gif(self.video_path)
                    if gif:
                        GLib.idle_add(lambda: self.web.evaluate_javascript(
                            "showToast('GIF copied to clipboard!');", -1, None, None, None, None, None
                        ))
                threading.Thread(target=do_gif, daemon=True).start()
            elif action == "delete_video":
                if os.path.exists(self.video_path):
                    os.remove(self.video_path)
                self.get_application().quit()
            elif action == "close":
                self.get_application().quit()
        except Exception as ex:
            print(f"Video share message error: {ex}", file=sys.stderr)


def launch_video_share_modal(video_path):
    """Spawns the video preview and share modal."""
    app = Gtk.Application(application_id="dev.doodlshot.dialog", flags=Gio.ApplicationFlags.FLAGS_NONE)

    def on_activate(a):
        win = VideoShareWindow(a, video_path)
        win.present()

    app.connect("activate", on_activate)
    app.run(None)


def start_recording(geometry=None):
    """Starts wf-recorder with clean non-invasive desktop notification controls."""
    if is_recording():
        return False

    DEFAULT_RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    out_file = DEFAULT_RECORDINGS_DIR / f"Doodlshot_rec_{ts}.mp4"

    cmd = [
        "wf-recorder",
        "-c", "libx264",
        "-x", "yuv420p",
        "-p", "crf=26",
        "-p", "preset=veryfast",
        "-f", str(out_file)
    ]
    clean_geom = sanitize_geometry(geometry)
    if clean_geom:
        cmd.extend(["-g", clean_geom])

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        subprocess.run(["notify-send", "-a", "Doodlshot", "Recording Error", "wf-recorder is not installed."])
        return False

    time.sleep(0.15)
    if proc.poll() is not None:
        subprocess.run(["notify-send", "-a", "Doodlshot", "Recording Error", "wf-recorder failed to start."])
        return False

    # Save PID info
    pid_data = {
        "pid": proc.pid,
        "file": str(out_file),
        "start_time": time.time()
    }
    PID_FILE.write_text(json.dumps(pid_data), encoding="utf-8")

    # Spawn desktop notification with Stop action button
    notif_cmd = [
        "notify-send",
        "-a", "Doodlshot",
        "-u", "critical",
        "-t", "0",
        "-A", "stop=⏹ Stop Recording",
        "🔴 Recording Screen...",
        "Recording in progress.\nClick below or press keybinding to stop."
    ]
    notif_proc = subprocess.Popen(notif_cmd, stdout=subprocess.PIPE, text=True)

    def watch_notif():
        try:
            line = notif_proc.stdout.readline()
            if "stop" in line:
                stop_recording()
        except Exception:
            pass

    threading.Thread(target=watch_notif, daemon=True).start()

    # Wait for wf-recorder to finish (either via notification click, external doodlshot -r, or SIGINT)
    proc.wait()

    # Dismiss notification
    try:
        notif_proc.terminate()
        notif_proc.wait(timeout=0.5)
    except Exception:
        pass

    if PID_FILE.exists():
        try:
            PID_FILE.unlink()
        except Exception:
            pass

    if out_file.exists():
        copy_video_to_clipboard(str(out_file))
        subprocess.run(["notify-send", "-a", "Doodlshot", "Screen Recording Saved", f"Saved to {out_file.name}\n(Copied to clipboard)"])
        launch_video_share_modal(str(out_file))

    return True


def toggle_recording():
    """Toggles screen recording: if recording, stops it; if not, slurp-selects and records."""
    if is_recording():
        stop_recording()
        return

    # Select area with slurp
    try:
        slurp_proc = subprocess.run(["slurp"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if slurp_proc.returncode != 0 or not slurp_proc.stdout.strip():
            sys.exit(0)  # Cancelled by user
        geometry = slurp_proc.stdout.strip()
    except FileNotFoundError:
        geometry = None

    start_recording(geometry)


if __name__ == "__main__":
    toggle_recording()
