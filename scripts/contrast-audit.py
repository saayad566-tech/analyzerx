from __future__ import annotations


def luminance(hex_color: str) -> float:
    value = hex_color.lstrip('#')
    channels = [int(value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(first: str, second: str) -> float:
    a, b = luminance(first), luminance(second)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)

pairs = {
    'navy-on-gold': ('#001A3B', '#FDB913'),
    'charcoal-on-gold': ('#111111', '#FDB913'),
    'navy-on-highlight': ('#001A3B', '#FFD700'),
    'charcoal-on-amber': ('#111111', '#F5A623'),
    'white-on-navy': ('#F4F7FB', '#09111F'),
    'muted-on-dark': ('#91A2B8', '#09111F'),
}
for name, pair in pairs.items():
    ratio = contrast(*pair)
    print(f'{name}: {ratio:.2f}:1')
    if ratio < 4.5:
        raise SystemExit(f'FAIL: {name} below WCAG AA normal-text target')
print('PASS: all tested combinations meet the normal-text contrast target')
