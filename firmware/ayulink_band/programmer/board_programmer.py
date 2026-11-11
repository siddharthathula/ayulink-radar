#!/usr/bin/env python3
"""
AyuLink Board Programmer — one UI to flash ALL boards.

Boards (PlatformIO projects under firmware/):
    Gateway (ESP32) · Wrist Band (ESP32) · Smart Dispenser (ESP8266)
    Smart Hub (ESP32-S3) · ESP32-CAM · Wearable (ESP32) · Test Sender (ESP32-C3)

Features:
  * Auto-detects serial ports (pyserial)
  * Per-board port picker: "Auto (any free port)", a specific port, or "Skip"
  * Flashes selected boards in parallel on distinct ports
  * Live color-coded console + per-board status/elapsed time
  * Stop button terminates running flashes

Usage:
    python3 board_programmer.py
"""
import sys
import time
from pathlib import Path

from PyQt5.QtCore import QProcess, Qt, QTimer
from PyQt5.QtGui import QColor, QFont, QTextCharFormat, QTextCursor
from PyQt5.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QGridLayout, QHBoxLayout, QHeaderView,
    QLabel, QMainWindow, QMessageBox, QPlainTextEdit, QProgressBar, QPushButton,
    QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
)

try:
    import serial.tools.list_ports as list_ports
except ImportError:
    list_ports = None

FIRMWARE_DIR = Path(__file__).resolve().parent.parent

AUTO_PORT = "__AUTO__"
SKIP_PORT = "__SKIP__"

BOARDS = [
    # (key, label, chip, project dir, env, default enabled)
    ("gateway",   "Gateway",         "ESP32",      "Gateway",         "esp32dev",            True),
    ("wrist",     "Wrist Band",      "ESP32",      "Wrist_Band",      "esp32dev",            True),
    ("dispenser", "Smart Dispenser", "ESP8266",    "Smart_Dispenser", "nodemcuv2",           True),
    # ESP32-S3 hub variant retired -> docs/archive/Smart_Hub (see ARCHIVED.md).
    # The live hub is the NodeMCU: ("hub", "Smart Hub", "NodeMCU", "Smart_Dispenser", "nodemcuv2", True),
    ("cam",       "ESP32-CAM",       "ESP32-CAM",  "ESP32_CAM",       "esp32cam",            False),
    ("wearable",  "Wearable",        "ESP32",      "Wearable",        "esp32dev",            False),
    ("test",      "Test Sender",     "ESP32-C3",   "Test_Sender",     "esp32-c3-devkitm-1",  False),
]

BOARD_COLORS = [
    QColor(86, 156, 214), QColor(206, 145, 120), QColor(181, 206, 168),
    QColor(220, 220, 170), QColor(206, 145, 209), QColor(79, 193, 255),
    QColor(255, 204, 102),
]


def detect_ports():
    """Return [(device, description), ...] of usable serial ports, or [] if pyserial is missing."""
    if list_ports is None:
        return []
    try:
        ports = [(p.device, (p.description or "Serial").strip())
                 for p in sorted(list_ports.comports(), key=lambda p: p.device)]
    except Exception:
        return []
    # Filter internal motherboard ports (/dev/ttyS*) — they are not USB boards
    return [p for p in ports if not p[0].startswith("/dev/ttyS")]


class BoardRow:
    """State for one board row."""

    def __init__(self, key, label, chip, proj_dir, env, enabled, color):
        self.key = key
        self.label = label
        self.chip = chip
        self.proj_dir = FIRMWARE_DIR / proj_dir
        self.env = env
        self.enabled = enabled
        self.color = color
        self.process = None
        self.start_ts = None


class ProgrammerWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AyuLink Board Programmer")
        self.resize(980, 640)
        self.rows = [BoardRow(*b, color=BOARD_COLORS[i])
                     for i, b in enumerate(BOARDS)]
        self.running = False
        self.used_ports = set()

        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)

        # ── Ports bar ─────────────────────────────
        ports_bar = QHBoxLayout()
        ports_bar.addWidget(QLabel("Detected ports:"))
        self.ports_label = QLabel("—")
        ports_bar.addWidget(self.ports_label, 1)
        self.btn_refresh = QPushButton("Refresh Ports")
        self.btn_refresh.clicked.connect(self.refresh_ports)
        ports_bar.addWidget(self.btn_refresh)
        root.addLayout(ports_bar)

        # ── Board table ───────────────────────────
        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["Enable", "Board", "Chip", "Port"])
        self.table.verticalHeader().setVisible(False)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.table.setColumnWidth(0, 60)
        self.table.setColumnWidth(2, 110)
        self.table.setColumnWidth(3, 200)
        self.table.setSelectionMode(QTableWidget.NoSelection)
        root.addWidget(self.table, 1)

        # ── Controls ──────────────────────────────
        ctrl = QHBoxLayout()
        self.btn_flash = QPushButton("▶  Program Selected Boards")
        self.btn_flash.clicked.connect(self.start_flash)
        self.btn_flash.setStyleSheet("font-weight:bold; padding:6px 14px;")
        self.btn_stop = QPushButton("■  Stop")
        self.btn_stop.clicked.connect(self.stop_all)
        self.btn_stop.setEnabled(False)
        self.btn_stop.setStyleSheet("padding:6px 14px;")
        self.progress = QProgressBar()
        self.progress.setRange(0, 0)
        self.progress.setVisible(False)
        ctrl.addWidget(self.btn_flash)
        ctrl.addWidget(self.btn_stop)
        ctrl.addWidget(self.progress)
        root.addLayout(ctrl)

        # ── Console ───────────────────────────────
        self.console = QPlainTextEdit()
        self.console.setReadOnly(True)
        self.console.setFont(QFont("Monospace", 9))
        self.console.setMaximumBlockCount(2000)
        root.addWidget(self.console, 2)

        self._rebuild_table()
        self.refresh_ports()
        self._log("info", "AyuLink Board Programmer ready.")
        self._log("info", f"Firmware root: {FIRMWARE_DIR}")

    # ── UI helpers ───────────────────────────────
    def refresh_ports(self):
        ports = detect_ports()
        if not ports:
            self.ports_label.setText("No serial ports found (pyserial missing or nothing connected)")
        else:
            self.ports_label.setText("  |  ".join(f"{d} ({desc})" for d, desc in ports))
        for row in self.rows:
            combo = self._port_combo(row)
            current = combo.currentText()
            combo.blockSignals(True)
            combo.clear()
            combo.addItem("Auto (any free port)", AUTO_PORT)
            for device, desc in ports:
                combo.addItem(f"{device} — {desc}", device)
            combo.addItem("Skip (do not flash)", SKIP_PORT)
            idx = combo.findText(current) if current else 0
            combo.setCurrentIndex(idx if idx >= 0 else 0)
            combo.blockSignals(False)

    def _rebuild_table(self):
        self.table.setRowCount(len(self.rows))
        for i, row in enumerate(self.rows):
            combo = QComboBox()
            combo.setProperty("row", i)
            combo.setEnabled(row.enabled)
            combo.setStyleSheet("padding:2px 6px;")
            self.table.setCellWidget(i, 3, combo)
            row.combo = combo

            cb = QCheckBox()
            cb.setChecked(row.enabled)
            cb.stateChanged.connect(lambda st, r=row: self._set_enabled(r, st))
            cb.setStyleSheet("margin-left:12px;")
            self.table.setCellWidget(i, 0, cb)

            item = QTableWidgetItem(row.label)
            item.setForeground(QColor(220, 220, 220))
            self.table.setItem(i, 1, item)

            chip = QTableWidgetItem(row.chip)
            chip.setForeground(QColor(156, 220, 254))
            chip.setTextAlignment(Qt.AlignCenter)
            self.table.setItem(i, 2, chip)

    def _port_combo(self, row):
        return row.combo

    def _set_enabled(self, row, state):
        row.enabled = state == Qt.Checked
        row.combo.setEnabled(row.enabled)
        self._set_status(row, "pending" if row.enabled else "skipped", row.label)

    # ── Status column ────────────────────────────
    def _set_status(self, row, phase, text=None, color=None):
        t = self.table.item(row.combo.property("row"), 1)
        if t is None:
            return
        palette = {
            "pending": ("Pending", QColor(200, 200, 200)),
            "skipped": ("Skipped", QColor(120, 120, 120)),
            "build": ("Building…", QColor(255, 200, 90)),
            "upload": ("Uploading…", QColor(110, 200, 255)),
            "ok": ("OK ✓", QColor(120, 220, 120)),
            "fail": ("FAILED", QColor(255, 110, 110)),
            "stopped": ("Stopped", QColor(255, 160, 90)),
        }
        label, col = palette.get(phase, ("…", QColor(200, 200, 200)))
        if text:
            label = text
        t.setText(label)
        t.setForeground(color or col)

    # ── Console ──────────────────────────────────
    @staticmethod
    def _fmt(color):
        f = QTextCharFormat()
        f.setForeground(color)
        return f

    def _log(self, tag, message, color=None):
        ts = time.strftime("%H:%M:%S")
        tcol = QColor(110, 110, 110)
        fmt = QTextCursor(self.console.document())
        fmt.movePosition(QTextCursor.End)
        fmt.insertText(f"[{ts}] ", self._fmt(tcol))

        if tag in (row.key for row in self.rows):
            row = next(r for r in self.rows if r.key == tag)
            fmt.insertText(f"[{row.label}] ", self._fmt(row.color))
        elif tag == "err":
            fmt.insertText("[ERROR] ", self._fmt(QColor(255, 110, 110)))
        else:
            fmt.insertText(f"[{tag}] ", self._fmt(tcol))

        fmt.insertText(message + "\n", self._fmt(color or QColor(230, 230, 230)))
        self.console.verticalScrollBar().setValue(
            self.console.verticalScrollBar().maximum())

    # ── Flashing ─────────────────────────────────
    def start_flash(self):
        if self.running:
            return

        # Resolve port per enabled board
        taken = set()
        plans = []  # (row, port, error_or_None)
        for row in self.rows:
            if not row.enabled:
                self._set_status(row, "skipped")
                continue
            sel = self._port_combo(row).currentData()
            if sel == SKIP_PORT:
                self._set_status(row, "skipped")
                continue
            if sel == AUTO_PORT:
                free = [d for d, _ in detect_ports() if d not in taken]
                if not free:
                    plans.append((row, None, f"No free port for {row.label}"))
                    continue
                port = free[0]
            else:
                if sel in taken:
                    plans.append((row, None, f"Port {sel} already used by another board"))
                    continue
                port = sel
            taken.add(port)
            plans.append((row, port, None))

        if not plans:
            QMessageBox.warning(self, "No boards to flash",
                                "Enable at least one board and make sure a port is available.")
            return

        self.running = True
        self.btn_flash.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.progress.setVisible(True)
        self._log("info", "─" * 56)
        self._log("info", "Starting flash sequence…")

        for row, port, err in plans:
            if err:
                self._log("err", f"{row.label}: {err}")
                self._set_status(row, "fail", "no port")
                continue
            self._flash_one(row, port)

    def _flash_one(self, row, port):
        self._log(row.key, f"Flashing on {port} — pio run -t upload (env {row.env})")
        self._set_status(row, "pending", f"Flashing on {port}")
        row.start_ts = time.time()

        proc = QProcess(self)
        proc.setWorkingDirectory(str(row.proj_dir))
        env = proc.processEnvironment()
        env.insert("PATH", f"{Path.home() / '.local' / 'bin'}:{os_environ_path()}")
        proc.setProcessEnvironment(env)
        proc.setProcessChannelMode(QProcess.MergedChannels)
        proc.readyReadStandardOutput.connect(
            lambda r=row, p=proc: self._pump(r, p))
        proc.finished.connect(
            lambda code, status, r=row, p=proc: self._done(r, p, code, status))
        row.process = proc

        pio = "pio"
        args = ["run", "-t", "upload", "--upload-port", port]
        if row.env:
            args += ["-e", row.env]
        proc.start(pio, args)
        if not proc.waitForStarted(3000):
            self._log("err", f"{row.label}: could not start pio — is PlatformIO installed?")
            self._set_status(row, "fail")
            self._finish_check()

    def _pump(self, row, proc):
        data = bytes(proc.readAllStandardOutput()).decode(errors="replace")
        for line in data.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            low = stripped.lower()
            if "compiling" in low or "processing" in low:
                self._set_status(row, "build")
            elif "uploading" in low or "connecting" in low or "esptool" in low:
                self._set_status(row, "upload")
            self._log(row.key, stripped[:300], QColor(200, 200, 200))

    def _done(self, row, proc, code, status):
        elapsed = time.time() - (row.start_ts or time.time())
        if code == 0:
            self._log(row.key, f"SUCCESS in {elapsed:.0f}s", QColor(120, 220, 120))
            self._set_status(row, "ok", f"OK {elapsed:.0f}s")
        else:
            reason = {QProcess.CrashExit: "crashed/killed"}.get(status, f"exit {code}")
            self._log(row.key, f"FAILED ({reason})", QColor(255, 110, 110))
            self._set_status(row, "fail", f"FAIL {reason}")
        row.process = None
        self._finish_check()

    def _finish_check(self):
        if any(r.process is not None for r in self.rows):
            return
        self.running = False
        self.btn_flash.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.progress.setVisible(False)
        done = sum(1 for r in self.rows if r.start_ts is not None)
        ok = sum(1 for r in self.rows if r.start_ts is not None and r.process is None
                 and self.table.item(r.combo.property("row"), 1).text().startswith("OK"))
        self._log("info", f"Flash sequence finished — {ok}/{done} boards OK")
        self._log("info", "─" * 56)

    def stop_all(self):
        for row in self.rows:
            if row.process and row.process.state() != QProcess.NotRunning:
                row.process.terminate()
                QTimer.singleShot(1500,
                                  lambda r=row: r.process.kill()
                                  if r.process.state() != QProcess.NotRunning else None)
                self._log("err", f"{row.label}: stopping…")
                self._set_status(row, "stopped")
        self._log("info", "Stop requested.")

    def closeEvent(self, event):
        self.stop_all()
        event.accept()


def os_environ_path():
    import os
    return os.environ.get("PATH", "")


def main():
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setStyleSheet("""
        QMainWindow, QWidget { background: #1e1f24; color: #e6e6e6; }
        QLabel { color: #c9c9d1; }
        QPushButton { background: #2c2e36; border: 1px solid #3a3d48;
                      border-radius: 4px; padding: 4px 10px; }
        QPushButton:hover { background: #363947; }
        QPushButton:disabled { color: #6b6e79; }
        QTableWidget { background: #23252c; alternate-background-color: #272932;
                       border: 1px solid #3a3d48; gridline-color: #33363f; }
        QHeaderView::section { background: #2c2e36; color: #b8bcc8;
                               border: none; padding: 5px; }
        QComboBox { background: #2c2e36; border: 1px solid #3a3d48;
                    border-radius: 4px; padding: 3px 6px; }
        QComboBox QAbstractItemView { background: #2c2e36; selection-background-color: #3a5a8c; }
        QPlainTextEdit { background: #141519; color: #e6e6e6; border: 1px solid #3a3d48; }
        QProgressBar { background: #23252c; border: 1px solid #3a3d48;
                       border-radius: 4px; }
        QProgressBar::chunk { background: #4c9aff; }
        QCheckBox { spacing: 6px; }
    """)
    win = ProgrammerWindow()
    win.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
