import sys
from PIL import Image, ImageDraw, ImageFont
# usage: compose.py out.jpg mode(light-688|dark-688|light-390) id1 id2 ...  (before/after side by side per id)
import os
ROOT = os.environ.get('SHOTS', '/data/work/shots')  # 目录下放 before/ 和 after/
out, mode, *ids = sys.argv[1:]
F = ImageFont.truetype('/usr/share/fonts/google-noto-sans-cjk-fonts/NotoSansCJK-Bold.ttc', 28) if False else None
import glob
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK*Bold*', recursive=True) + glob.glob('/usr/share/fonts/**/NotoSansSC*', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))
font = ImageFont.truetype(fp[0], 30) if fp else ImageFont.load_default()
dark = mode.startswith('dark')
bg = (24, 24, 27) if dark else (244, 244, 245); fg = (250, 250, 250) if dark else (10, 10, 10)
rows = []
for i in ids:
    pair = []
    for side in ('before', 'after'):
        p = f'{ROOT}/{side}/{i}-{mode}.png'
        try:
            im = Image.open(p).convert('RGB')
            from PIL import ImageChops
            bgc = im.getpixel((im.width - 2, im.height - 2))
            bb = ImageChops.difference(im, Image.new('RGB', im.size, bgc)).point(lambda v: 255 if v > 12 else 0).getbbox()
            if bb: im = im.crop((0, 0, im.width, min(im.height, bb[3] + 40)))
            pair.append(im)
        except FileNotFoundError: pair.append(None)
    rows.append((i, pair))
W = max((im.width for _, pr in rows for im in pr if im), default=800)
pad = 24; lab = 52
total_h = sum(lab + max((im.height for im in pr if im), default=200) + pad for _, pr in rows) + pad
C = Image.new('RGB', (W * 2 + pad * 3, total_h), bg); d = ImageDraw.Draw(C)
y = pad
for i, pr in rows:
    h = max((im.height for im in pr if im), default=200)
    for k, im in enumerate(pr):
        x = pad + k * (W + pad)
        d.text((x, y), f"{i} · {'改前' if k == 0 else '改后'}", fill=fg, font=font)
        if im: C.paste(im, (x, y + lab))
        else: d.text((x, y + lab + 20), '（新增，改前没有）', fill=fg, font=font)
    y += lab + h + pad
C.thumbnail((1800, 100000))
C.save(out, quality=82)
print(out, C.size)
