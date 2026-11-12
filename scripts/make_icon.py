from PIL import Image, ImageDraw
import math

def make_icon(size):
    S = size
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c1, c2 = (11, 31, 58), (13, 148, 136)
    # vertical gradient background (navy -> teal)
    for y in range(S):
        t = y / S
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        d.line([(0, y), (S, y)], fill=(r, g, b, 255))
    # rounded corner mask
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=255)
    img.putalpha(mask)

    # ECG pulse trace across the middle
    w_line = max(2, S // 40)
    pts = []
    for i in range(101):
        x = S * i / 100
        off = abs(i - 50)
        if off < 3:
            y = S * 0.32
        elif off < 8:
            y = S * 0.62
        elif off < 14:
            y = S * 0.22
        elif off < 20:
            y = S * 0.72
        else:
            y = S * 0.5
        pts.append((x, y))
    d.line(pts, fill=(94, 234, 212, 255), width=w_line, joint='curve')

    # vector heart silhouette above the trace
    cx, cy, hs = S // 2, int(S * 0.40), int(S * 0.145)
    heart = []
    for i in range(101):
        ang = math.pi * 2 * (i / 100)
        x = 16 * math.sin(ang) ** 3
        y = -(13 * math.cos(ang) - 5 * math.cos(2 * ang) - 2 * math.cos(3 * ang) - math.cos(4 * ang))
        heart.append((cx + x * hs / 8, cy + y * hs / 8))
    d.polygon(heart, fill=(255, 255, 255, 255))
    # small accent dot
    d.ellipse([S * 0.79, S * 0.44, S * 0.85, S * 0.50], fill=(45, 212, 191, 255))
    out = f'C:/Users/User/Documents/Default Project/DIstoHelp/frontend/public/icon-{S}.png'
    img.save(out)
    print('wrote', out)

make_icon(512)
make_icon(192)
