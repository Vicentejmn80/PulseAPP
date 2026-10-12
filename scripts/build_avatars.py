from pathlib import Path

root = Path(__file__).resolve().parents[1] / "public" / "avatars"
root.mkdir(parents=True, exist_ok=True)

frame = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<defs>
<radialGradient id="bg" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#243028"/><stop offset="1" stop-color="#0B0D0F"/></radialGradient>
<linearGradient id="lime" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3FF9A"/><stop offset="1" stop-color="#B6E000"/></linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F7F2"/><stop offset="1" stop-color="#9AA39A"/></linearGradient>
</defs>
<circle cx="64" cy="64" r="62" fill="url(#bg)" stroke="#CFFF00" stroke-width="4"/>
{body}
</svg>
"""

bodies = {
    "magallanes": '<path d="M28 78h72l-8 10H36z" fill="#1C2428"/><path d="M34 78 L64 40 L94 78Z" fill="url(#metal)"/><path d="M64 40 L78 78 H64Z" fill="#CFFF00"/><circle cx="64" cy="62" r="4" fill="#0B0D0F"/>',
    "leones": '<path d="M40 70c0-18 10-30 24-30s24 12 24 30c0 16-10 28-24 28S40 86 40 70z" fill="#E6B15A"/><path d="M46 48c-8-14-2-24 6-20 4-10 16-10 20 0 8-4 14 6 6 20" fill="#C9842A"/><circle cx="54" cy="68" r="3" fill="#0B0D0F"/><circle cx="74" cy="68" r="3" fill="#0B0D0F"/><path d="M58 78h12l-6 8z" fill="#0B0D0F"/>',
    "tigres": '<path d="M38 72c0-20 12-34 26-34s26 14 26 34-10 30-26 30-26-10-26-30z" fill="#F0A202"/><path d="M44 58h8l-2 16h-4zm28 0h8l-2 16h-6z" fill="#0B0D0F"/><circle cx="54" cy="70" r="3" fill="#0B0D0F"/><circle cx="74" cy="70" r="3" fill="#0B0D0F"/><path d="M64 74l4 6h-8z" fill="#0B0D0F"/>',
    "tiburones": '<path d="M24 70c18-6 36-22 58-18 10 2 18 10 18 16-16 4-34 2-52 8-10-2-18-4-24-6z" fill="#7FD0E0"/><path d="M78 58l10-16 2 18z" fill="#CFFF00"/><circle cx="86" cy="66" r="2.5" fill="#0B0D0F"/><path d="M30 74l14 10-8 2z" fill="#1C4A55"/>',
    "aguilas": '<path d="M30 70c12-28 22-36 34-36s22 8 34 36c-12 4-22-2-34-2s-22 6-34 2z" fill="#F4F1E8"/><path d="M58 62h12l-6 16z" fill="#E2B340"/><circle cx="52" cy="60" r="2.4" fill="#0B0D0F"/><circle cx="76" cy="60" r="2.4" fill="#0B0D0F"/>',
    "caribes": '<path d="M34 78c10-28 22-40 30-40 16 0 22 18 30 40-16-8-28-8-60 0z" fill="#CFFF00"/><path d="M46 70c8-14 16-20 18-20 8 0 12 10 18 20" fill="none" stroke="#0B0D0F" stroke-width="4"/>',
    "cardenales": '<path d="M46 74c0-16 8-28 18-28 14 0 22 12 22 26 0 12-8 20-20 20-10 0-20-6-20-18z" fill="#E23B2F"/><path d="M78 58c10-2 18 4 16 10-8 0-14-4-16-10z" fill="#E2B340"/><circle cx="60" cy="66" r="2.5" fill="#0B0D0F"/><path d="M40 50c6-12 14-10 12 2" fill="#E23B2F"/>',
    "bravos": '<path d="M64 34l22 10v22c0 16-10 26-22 30-12-4-22-14-22-30V44z" fill="#F4F1E8"/><path d="M64 48l12 14h-8l4 16-16-18h8z" fill="#CFFF00"/>',
    "rusher": '<circle cx="64" cy="64" r="26" fill="#F4F1E8" stroke="#CFFF00" stroke-width="4"/><path d="M64 42c8 10 8 18 0 28-8-10-8-18 0-28z" fill="#E23B2F"/>',
}

for name, body in bodies.items():
    (root / f"{name}.svg").write_text(frame.format(body=body), encoding="utf-8")
print(len(bodies))
