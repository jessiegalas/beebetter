"""BeeBetter pixel button pack v0.3 (light + dark). Regenerate with: python3 build.py
Edit the THEMES block (tokens + palettes) and re-run to retheme. Values marked ASSUMED are not confirmed BeeBetter tokens."""
import json
from PIL import Image, ImageDraw, ImageFont

N = 16
SLICE = dict(left=4, top=4, right=4, bottom=4)
SCALES = (1, 2, 3)
DISPLAY_SCALE = 3
RING_M = 3

def rgba(h): return None if h is None else tuple(int(h[i:i+2], 16) for i in (1,3,5)) + (255,)

# ============================ THEMES ============================
LIGHT = dict(
  tokens=dict(background="#F8F7DE", cream="#F8F7DE", ink="#3B2410", focus="#854D0D"),   # all confirmed
  disabled=dict(outline="#8A7F73", fill="#CFC6B8", highlight="#E6DFD3", shade="#B5AB9C", label="#4F4840"),
  variants={
   "primary":      dict(outline="#3B2410", fill="#854D0D", highlight="#A8681E", shade="#5E3508", press_fill="#6F3F08", press_shade="#5E3508", label="cream", spinner="cream"),
   "secondary":    dict(outline="#3B2410", fill="#F3E3C0", highlight="#FFF8E6", shade="#D9C28F", press_fill="#E6D3A8", press_shade="#D9C28F", label="ink", spinner="dark"),
   "quiet":        dict(outline="#6B4A26", fill=None, highlight=None, shade="#D8C7A1", press_fill="#EAD9B5", press_shade="#D8C7A1", label="ink", spinner="dark"),
   "destructive":  dict(outline="#4A140F", fill="#B8322A", highlight="#D9584E", shade="#8A221B", press_fill="#9C2A23", press_shade="#8A221B", label="cream", spinner="cream"),
   "accent":       dict(outline="#3B2410", fill="#F5B83D", highlight="#FFE08A", shade="#C98410", press_fill="#E3A12B", press_shade="#C98410", label="ink", spinner="dark"),
   "accent-quiet": dict(outline="#A8700F", fill="#FFF0C2", highlight="#FFF9E0", shade="#F2D88A", press_fill="#F8DD8E", press_shade="#E8C766", label="ink", spinner="dark"),
  })
DARK = dict(
  # Dark colors are real BeeBetter tokens (design-tokens.json, dark). DERIVED = no token exists, my pick:
  # highlight/shade lip colors, accent pressed fill, disabled outline/highlight/shade.
  tokens=dict(background="#21190F", cream="#F8F7DE", ink="#3A200C", focus="#F7EA87"),
  disabled=dict(outline="#6B5D44", fill="#493D2A", highlight="#5A4D38", shade="#3A3022", label="#D1C4A6"),
  variants={
   "primary":      dict(outline="#3A200C", fill="#F7EA87", highlight="#FFF7BF", shade="#C9BC63", press_fill="#E1D373", press_shade="#C9BC63", label="ink", spinner="ink"),
   "secondary":    dict(outline="#A59473", fill="#30261A", highlight="#403424", shade="#221A10", press_fill="#493D2A", press_shade="#30261A", label="cream", spinner="cream"),
   "quiet":        dict(outline="#A59473", fill=None, highlight=None, shade="#30261A", press_fill="#493D2A", press_shade="#30261A", label="cream", spinner="cream"),
   "destructive":  dict(outline="#48271F", fill="#FFB4A8", highlight="#FFD3CB", shade="#D98C80", press_fill="#F09E91", press_shade="#D98C80", label="#21190F", spinner="ink"),
   "accent":       dict(outline="#3A200C", fill="#D29D30", highlight="#E8B957", shade="#9A6F1A", press_fill="#BE8B27", press_shade="#9A6F1A", label="ink", spinner="ink"),
   "accent-quiet": dict(outline="#D29D30", fill="#40351B", highlight="#504223", shade="#2E2613", press_fill="#493D2A", press_shade="#40351B", label="cream", spinner="cream"),
  })
THEMES = {"light": LIGHT, "dark": DARK}
SPIN_COLORS = {"light": {"dark": LIGHT["tokens"]["ink"], "cream": LIGHT["tokens"]["cream"]},
               "dark":  {"dark": LIGHT["tokens"]["ink"], "cream": DARK["tokens"]["cream"], "ink": DARK["tokens"]["ink"]}}
SPIN_FILES = {"dark": "spinner-hex-dark", "cream": "spinner-hex-cream", "ink": "spinner-hex-ink"}

# ============================ geometry / helpers ============================
def chamfer_mask(w, h, k):
    return {(x, y) for y in range(h) for x in range(w) if min(x, w-1-x) + min(y, h-1-y) >= k}
BTN_MASK = chamfer_mask(N, N, 2)
def is_outline(x, y): return any((x+dx, y+dy) not in BTN_MASK for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)))

def make_face(p, state):
    im = Image.new("RGBA", (N, N), (0,0,0,0))
    for (x, y) in BTN_MASK:
        if is_outline(x, y): c = rgba(p["outline"])
        elif state == "pressed": c = rgba(p["press_shade"]) if y in (1, 2) else rgba(p["press_fill"])
        else:
            if y == 1: c = rgba(p["highlight"] or p["fill"])
            elif y in (13, 14): c = rgba(p["shade"])
            else: c = rgba(p["fill"])
        im.putpixel((x, y), c if c is not None else (0,0,0,0))
    return im

def disabled_face(d):
    return make_face(dict(outline=d["outline"], fill=d["fill"], highlight=d["highlight"], shade=d["shade"],
                          press_fill=d["fill"], press_shade=d["shade"]), "normal")

def nine_slice(im, w, h, s):
    L, T, R, B = s["left"], s["top"], s["right"], s["bottom"]; W, H = im.size
    out = Image.new("RGBA", (w, h), (0,0,0,0))
    xs_s = [(0, L), (L, W-R), (W-R, W)]; ys_s = [(0, T), (T, H-B), (H-B, H)]
    xs_d = [(0, L), (L, w-R), (w-R, w)]; ys_d = [(0, T), (T, h-B), (h-B, h)]
    for j in range(3):
        for i in range(3):
            piece = im.crop((xs_s[i][0], ys_s[j][0], xs_s[i][1], ys_s[j][1]))
            out.paste(piece.resize((xs_d[i][1]-xs_d[i][0], ys_d[j][1]-ys_d[j][0]), Image.NEAREST), (xs_d[i][0], ys_d[j][0]))
    return out

def save_scaled(im, stem, folder):
    for sc in SCALES:
        name = f"{folder}/{stem}.png" if sc == 1 else f"{folder}/{stem}@{sc}x.png"
        im.resize((im.width*sc, im.height*sc), Image.NEAREST).save(name)

def check_9slice(im, s, label):
    W, H = im.size; px = im.load(); L, T, R, B = s["left"], s["top"], s["right"], s["bottom"]
    assert nine_slice(im, W, H, s).tobytes() == im.tobytes(), label + " identity"
    for y in range(T, H-B): assert len({px[x, y] for x in range(L, W-R)}) == 1, (label, "centre row", y)
    for x in range(L, W-R): assert len({px[x, y] for y in range(T, H-B)}) == 1, (label, "centre col", x)
    for y in list(range(0, T)) + list(range(H-B, H)): assert len({px[x, y] for x in range(L, W-R)}) == 1, (label, "edge row", y)
    for x in list(range(0, L)) + list(range(W-R, W)): assert len({px[x, y] for y in range(T, H-B)}) == 1, (label, "edge col", x)
    assert all(px[x, y][3] in (0, 255) for x in range(W) for y in range(H)), label + " anti-aliasing"

def lum(h):
    f = lambda c: c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    r, g, b = [int(h[i:i+2], 16)/255 for i in (1,3,5)]
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)
def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la+0.05)/(lb+0.05)

# ============================ shared assets: ring, spinner ============================
RW = N + 2*RING_M
outer = chamfer_mask(RW, RW, 3)
hole = {(x+2, y+2) for (x, y) in chamfer_mask(RW-4, RW-4, 2)}
RING_SLICE = dict(left=7, top=7, right=7, bottom=7)
def make_ring(color):
    im = Image.new("RGBA", (RW, RW), (0,0,0,0))
    for (x, y) in outer - hole: im.putpixel((x, y), rgba(color))
    return im
rings = {t: make_ring(THEMES[t]["tokens"]["focus"]) for t in THEMES}
for t, im in rings.items():
    check_9slice(im, RING_SLICE, f"focus-ring-{t}")
    px = im.load(); assert all(px[x, y][3] == 0 for x in range(RING_M, RING_M+N) for y in range(RING_M, RING_M+N))
save_scaled(rings["light"], "button-focus-ring", "focus")
save_scaled(rings["dark"], "button-focus-ring-dark", "focus")

DOTS = [(4,0),(7,2),(7,6),(4,8),(1,6),(1,2)]
def spinner_sheet(color):
    c = rgba(color); sheet = Image.new("RGBA", (70, 10), (0,0,0,0))
    for f in range(7):
        lit = DOTS if f == 6 else [DOTS[(f+i) % 6] for i in range(3)]
        for (dx, dy) in lit:
            for ox in (0,1):
                for oy in (0,1): sheet.putpixel((f*10+dx+ox, dy+oy), c)
    return sheet
spin_sheets = {}   # (theme, key) -> image
for t in THEMES:
    for k, col in SPIN_COLORS[t].items(): spin_sheets[(t, k)] = spinner_sheet(col)
for k, col in {"dark": LIGHT["tokens"]["ink"], "cream": LIGHT["tokens"]["cream"], "ink": DARK["tokens"]["ink"]}.items():
    save_scaled(spinner_sheet(col), SPIN_FILES[k], "spinner")

# ============================ per-theme faces + checks ============================
faces, dis_faces, report, atlas_themes = {}, {}, [], {}
def color_of(theme, key): return THEMES[theme]["tokens"].get(key, key)
for t, th in THEMES.items():
    tk = th["tokens"]; BG = tk["background"]; folder = "button" if t == "light" else "button/dark"
    pre = "" if t == "light" else "dark/"
    vout = {}
    for name, p in th["variants"].items():
        if p == "reuse-light":
            p = LIGHT["variants"][name]; faces[(t, name, "normal")] = faces[("light", name, "normal")]; faces[(t, name, "pressed")] = faces[("light", name, "pressed")]
            files = (f"button-{name}-normal", f"button-{name}-pressed"); reuse = True
        else:
            for st in ("normal", "pressed"):
                im = make_face(p, st); faces[(t, name, st)] = im
                check_9slice(im, SLICE, f"{t}-{name}-{st}"); save_scaled(im, f"button-{name}-{st}", folder)
            files = (f"{pre}button-{name}-normal", f"{pre}button-{name}-pressed"); reuse = False
        lab = tk.get(p["label"], p["label"]) if p["label"] in tk else p["label"]
        # label colour resolve (accent reuse keeps its light label)
        if reuse: lab = LIGHT["tokens"][p["label"]]
        spk = p["spinner"]; spin_col = SPIN_COLORS["light" if reuse else t][spk]
        bgc = BG
        nf = p["fill"] or bgc
        for what, fg, bb, lim in [("normal label", lab, nf, 4.5), ("pressed label", lab, p["press_fill"], 4.5),
                                  ("spinner on loading face", spin_col, p["press_fill"], 3.0),
                                  ("boundary vs page bg", (p["fill"] or p["outline"]), bgc, 3.0) if not reuse else ("boundary vs page bg", p["fill"], bgc, 3.0)]:
            if what == "boundary vs page bg" and p["fill"]: val = max(ratio(p["fill"], bb), ratio(p["outline"], bb))
            else: val = ratio(fg, bb)
            report.append((t, name, what, val)); assert val >= lim, (t, name, what, val)
        vout[name] = dict(normal=files[0], pressed=files[1], disabled=f"{pre}button-disabled",
                          loading=dict(face=files[1], spinner=SPIN_FILES[spk]), label_color=lab,
                          palette={k: v for k, v in p.items() if k not in ("label", "spinner")}, **({"reuses_light_files": True} if reuse else {}))
    d = disabled_face(th["disabled"]); dis_faces[t] = d; check_9slice(d, SLICE, f"{t}-disabled"); save_scaled(d, "button-disabled", folder)
    r = ratio(th["disabled"]["label"], th["disabled"]["fill"]); report.append((t, "disabled", "label", r)); assert r >= 4.5
    r = ratio(tk["focus"], BG); report.append((t, "focus-ring", "vs page bg", r)); assert r >= 3.0
    atlas_themes[t] = dict(variants=vout, disabled=dict(file=f"{pre}button-disabled", label_color=th["disabled"]["label"], shared_by_all_variants=True),
                           focus_ring=dict(file="button-focus-ring" if t == "light" else "button-focus-ring-dark", color=tk["focus"]),
                           page_background=BG)

# ============================ content zones ============================
dp = lambda a: a * DISPLAY_SCALE
zones = {"normal": dict(left=dp(4), right=dp(4), top=dp(2), bottom=dp(3)),
         "pressed": dict(left=dp(4), right=dp(4), top=dp(3), bottom=dp(1))}
for st, z in zones.items():
    z["clear_height_at_48dp"] = dp(N) - z["top"] - z["bottom"]; assert z["clear_height_at_48dp"] >= 24
assert dp(14) - zones["normal"]["top"] - zones["normal"]["bottom"] >= 24
assert 10*3 <= zones["pressed"]["clear_height_at_48dp"]            # 3x spinner fits vertically in pressed zone at 48dp
assert 10*3 + 2*12 == 54 and 10*2 + 2*12 <= 48                      # 3x needs 54dp width; 2x fits the 48dp minimum
assert dp(14) - zones["pressed"]["top"] - zones["pressed"]["bottom"] >= 10*3   # 3x spinner still fits in compact

L_ = atlas_themes["light"]
atlas = {
  "asset": "pixel-button", "version": "0.4.0", "themes_available": ["light", "dark"],
  "assumptions": {
    "light_theme": "all tokens confirmed (background/cream #F8F7DE, focus #854D0D)",
    "dark_theme": "fills, outlines, labels, focus ring and page background are real BeeBetter dark tokens. DERIVED (no token, my pick): the highlight/shade lip colors, the dark accent pressed fill (#BE8B27), and the dark disabled outline/highlight/shade",
    "accent_dark": "regenerated on-token (#D29D30); no longer reuses the light PNGs",
    "quiet_family": "outlined interpretation kept for quiet and accent-quiet (not borderless). Update tokens to match, or request transparent borderless versions",
  },
  "grid": {"base_art_px": 16, "scales": list(SCALES), "display_scale_default": DISPLAY_SCALE,
           "scaling": "integer only, nearest-neighbor, no smoothing", "dp_formula": "dp = art_px * display_scale"},
  "slice_insets_art_px": SLICE,
  "sizes": {"default": {"height_art_px": 16, "height_dp": 48}, "compact": {"height_art_px": 14, "height_dp": 42, "note": "same 16px sprite 9-sliced to 14 art px tall, drawn at 3x: corners stay 12dp, only the stretchable middle shrinks (8 -> 6 art px). No fractional scaling. Still use a 48dp hit target (hitSlop)"},
            "wide": "any width >= 16 art px", "min_art_size_px": {"w": 8, "h": 8}, "touch_target_dp": {"w": 48, "h": 48}},
  "content_insets_dp_at_default_scale": {"unit": "dp (not art px)",
      "how_to_use": "centre the real text label inside this clear zone; pressed zone is lower, so the label sinks automatically (no separate offset)",
      "min_horizontal_text_padding_dp": 16, "normal": zones["normal"], "pressed": zones["pressed"]},
  # --- light theme: top-level keys unchanged from v0.2 so existing integration keeps working
  "disabled": L_["disabled"], "variants": L_["variants"],
  "focus_ring": dict(**L_["focus_ring"], size_art_px=RW, slice_insets_art_px=RING_SLICE, margin_art_px=RING_M,
                     margin_dp_at_default_scale=dp(RING_M),
                     usage="overlay drawn on top, sized (button + 2*margin); extends outside the button layout box, so the wrapper must allow overflow (overflow: visible / padding), or it will clip"),
  "dark": dict(**atlas_themes["dark"], note="file paths are relative to button/ (dark faces live in button/dark/)"),
  "loading": {"face": "pressed face of the variant", "interactive": False,
              "spinner": {"files": SPIN_FILES, "frame_art_px": [10, 10], "frames_animated": 6, "fps": 10, "loop": True, "pivot": "center",
                          "reduced_motion_frame_index": 6, "display": {"default_scale": 3, "size_dp": 30, "use_when_button_width_dp_at_least": 54, "narrower_buttons_scale": 2, "size_dp_at_2x": 20, "note": "30dp = 10 art px x 3; needs 12dp text padding each side so 54dp min width; icon-only 48dp buttons use 2x (20dp)"}, "sheet": "7 frames in a row: 0-5 animation, 6 = all dots lit (static fallback)"},
              "label": "hide the label while loading, spinner centred in the pressed clear zone"},
  "naming_note": "plain .png (not .9.png) so Android tooling does not treat them as nine-patch files; insets live in this JSON",
  "follow_up": [
    "Selected state for chips/tabs/toggle buttons: belongs with the chip and tab assets, not built yet",
    "Light accent is #F5B83D but the accent token is #D29D30: decide whether to regenerate the light accent on-token",
    "Decide quiet/accent-quiet: keep the outlined look (update tokens) or ask for borderless transparent versions",
    "PixelButton wrapper must allow overflow for the focus ring"],
}
json.dump(atlas, open("pixel-button.atlas.json", "w"), indent=2)

# ============================ previews ============================
def get_font(sz):
    try: return ImageFont.load_default(size=sz)
    except TypeError: return ImageFont.load_default()
F16, F11 = get_font(16), get_font(11)
cols = ["normal", "pressed", "loading", "disabled", "focus"]
BW, BH = 40, 16
cell_w = BW*3 + 2*dp(RING_M) + 14; cell_h = BH*3 + 2*dp(RING_M) + 8; left_w, top_h = 108, 34

def render_preview(t, path):
    th = THEMES[t]; tk = th["tokens"]; BG = tk["background"]; INK = rgba(tk["cream"] if t == "dark" else tk["ink"])
    W = left_w + cell_w*len(cols) + 10; H = top_h + cell_h*len(th["variants"]) + 330
    sheet = Image.new("RGBA", (W, H), rgba(BG)); d = ImageDraw.Draw(sheet)
    d.text((10, 8), f"BeeBetter pixel button - {t} theme (1 px = 1 dp, labels are live text, not baked)", fill=INK, font=F11)
    for ci, c in enumerate(cols): d.text((left_w + ci*cell_w + dp(RING_M), 20), c, fill=INK, font=F11)
    place = lambda img, x, y: sheet.alpha_composite(img, (x, y))
    rb = lambda face, w, h: nine_slice(face, w, h, SLICE).resize((w*3, h*3), Image.NEAREST)
    def label_at(xy, w, h, z, text, color, font):
        d.text((xy[0] + w/2, xy[1] + (z["top"] + (h - z["bottom"]))/2), text, fill=rgba(color), font=font, anchor="mm")
    for ri, name in enumerate(th["variants"]):
        p = th["variants"][name]; reuse = (p == "reuse-light"); p = LIGHT["variants"][name] if reuse else p
        lab = LIGHT["tokens"][p["label"]] if reuse else tk.get(p["label"], p["label"])
        sp = spin_sheets[("light" if reuse else t, p["spinner"])]
        y0 = top_h + ri*cell_h + dp(RING_M); d.text((10, y0 + 18), name, fill=INK, font=F11)
        for ci, c in enumerate(cols):
            x0 = left_w + ci*cell_w + dp(RING_M)
            if c in ("normal", "focus"): face, z, lc = faces[(t, name, "normal")], zones["normal"], lab
            elif c in ("pressed", "loading"): face, z, lc = faces[(t, name, "pressed")], zones["pressed"], lab
            else: face, z, lc = dis_faces[t], zones["normal"], th["disabled"]["label"]
            place(rb(face, BW, BH), x0, y0)
            if c == "loading":
                fr = sp.crop((10, 0, 20, 10)).resize((30, 30), Image.NEAREST)
                place(fr, x0 + BW*3//2 - 15, y0 + (z["top"] + (BH*3 - z["bottom"]))//2 - 15)
            else: label_at((x0, y0), BW*3, BH*3, z, "Quest", lc, F16)
            if c == "focus":
                place(nine_slice(rings[t], BW+2*RING_M, BH+2*RING_M, RING_SLICE).resize(((BW+2*RING_M)*3, (BH+2*RING_M)*3), Image.NEAREST),
                      x0 - dp(RING_M), y0 - dp(RING_M))
    sy = top_h + cell_h*len(th["variants"]) + 8
    d.text((10, sy), "sizes (accent): compact 42dp / default 48dp / wide / narrow", fill=INK, font=F11)
    x = left_w; sy += 20
    for (w, h, txt) in [(30, 14, "Go"), (40, 16, "Quest"), (80, 16, "Start quest"), (12, 16, "")]:
        place(rb(faces[(t, "accent", "normal")], w, h), x, sy + (48 - h*3))
        if txt: label_at((x, sy + (48 - h*3)), w*3, h*3, zones["normal"], txt, LIGHT["tokens"]["ink"], F16)
        x += w*3 + 24
    gy = sy + 70; d.text((10, gy), "slice guide", fill=INK, font=F11)
    g = faces[(t, "accent", "normal")].resize((N*12, N*12), Image.NEAREST); gd = ImageDraw.Draw(g)
    for v in (4, 12):
        gd.line([(v*12, 0), (v*12, N*12)], fill=(220,40,60,255), width=2); gd.line([(0, v*12), (N*12, v*12)], fill=(220,40,60,255), width=2)
    place(g, left_w, gy)
    sheet.crop((0, 0, W, gy + N*12 + 12)).convert("RGB").save(path)
render_preview("light", "button-preview-light.png"); render_preview("dark", "button-preview-dark.png")

print("all validations passed")
for t, n, w, r in report: print(f"  {t:5s} {n:13s} {w:26s} {r:5.2f}:1")
