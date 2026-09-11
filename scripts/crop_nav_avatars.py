from pathlib import Path
from PIL import Image

src = Path(r"D:\DividendFlowPK\frontend\public\theme")
out = Path(r"D:\DividendFlowPK\frontend\public\theme\avatars")
out.mkdir(parents=True, exist_ok=True)

# Full-res 1536x1024 crops (preview 768x512 * 2)
crops = [
    ("dfpk-theme-01-title.png", 560, 360, 840, 840, "nav-overview.png"),      # center leader
    ("dfpk-theme-04-dividends.png", 560, 160, 960, 760, "nav-dividends.png"),  # DF hero
    ("dfpk-theme-02-race.png", 600, 280, 1040, 800, "nav-market.png"),         # race lead
    ("dfpk-theme-03-ipo.png", 100, 260, 700, 900, "nav-ipo.png"),              # IPO shouter
    ("dfpk-theme-01-title.png", 900, 400, 1160, 840, "nav-forecast.png"),      # phone investor
    ("dfpk-theme-04-dividends.png", 1000, 480, 1320, 860, "nav-income.png"),   # AI Market Buddy
    ("dfpk-theme-01-title.png", 40, 440, 280, 860, "nav-reporting.png"),       # laptop tech
    ("dfpk-theme-02-race.png", 1040, 340, 1440, 860, "nav-brokers.png"),       # glasses + flag
    ("dfpk-theme-02-race.png", 140, 340, 560, 820, "nav-us.png"),              # Dividend Challenger girl
    ("dfpk-theme-01-title.png", 280, 400, 540, 840, "nav-cheer.png"),          # orange hoodie girl
    ("dfpk-theme-01-title.png", 1180, 440, 1480, 880, "nav-student.png"),      # hijab student
]

for fname, left, top, right, bottom, name in crops:
    im = Image.open(src / fname).convert("RGB")
    crop = im.crop((left, top, right, bottom))
    width, height = crop.size
    side = max(width, height)
    canvas = Image.new("RGB", (side, side), (30, 58, 138))
    canvas.paste(crop, ((side - width) // 2, (side - height) // 2))
    avatar = canvas.resize((160, 160), Image.Resampling.LANCZOS)
    avatar.save(out / name, optimize=True)
    print("wrote", name, crop.size)

build_out = Path(r"D:\DividendFlowPK\frontend\build\theme\avatars")
build_out.mkdir(parents=True, exist_ok=True)
for path in out.glob("nav-*.png"):
    (build_out / path.name).write_bytes(path.read_bytes())

# cleanup previews
for junk in out.glob("_preview-*"):
    junk.unlink(missing_ok=True)
print("done")
