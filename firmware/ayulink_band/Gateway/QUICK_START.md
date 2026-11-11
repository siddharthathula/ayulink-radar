b# 📡 How to Connect to Gateway (Receiver)

The Gateway acts as a **WiFi Access Point**. Your laptop must connect to it directly to receive data.

### 1. Power On
Plug in the Gateway (12V Adapter).
Wait for the Green LED to light up or the OLED to show "AP: VitaLink_Gateway".

### 2. Connect WiFi
On your Laptop/Phone:
- **WiFi Name:** `VitaLink_Gateway`
- **Password:** `vitalink123`

### 3. Open Dashboard
The dashboard will automatically connect to `ws://192.168.4.1:81`.
- If you see "System Online" (Green Dot) → **Success!** ✅
- If you see "Check WiFi" (Red Toast) → You are on the wrong network.

---

### Troubleshooting
- **No WiFi?** Check if the ESP32 has power (Red LED on board).
- **No Data?** Ensure the Gateway is not too close to the laptop (interference).
