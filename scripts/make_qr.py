"""Generate QR codes for the live LAN URLs of the DIstoHelp demo.
Re-run whenever the Wi-Fi adapter's IP changes."""
import qrcode

BASE = "http://10.57.20.137:5173"
OUT = r"C:/Users/User/Documents/Default Project/DIstoHelp/frontend/public"

for name, url in [("lan-app", BASE), ("lan-portal", BASE + "/me")]:
    img = qrcode.make(url)
    path = f"{OUT}/{name}.png"
    img.save(path)
    print("wrote", path, "->", url)
