from pathlib import Path
from PIL import Image

source = Path('/home/ubuntu/webdev-static-assets/analyzerx-icon.png')
targets = [
    Path('/home/ubuntu/market-event-intelligence/assets/images/icon.png'),
    Path('/home/ubuntu/market-event-intelligence/assets/images/splash-icon.png'),
    Path('/home/ubuntu/market-event-intelligence/assets/images/favicon.png'),
    Path('/home/ubuntu/market-event-intelligence/assets/images/android-icon-foreground.png'),
    Path('/home/ubuntu/market-event-intelligence/assets/images/android-icon-monochrome.png'),
]

with Image.open(source).convert('RGB') as image:
    image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
    for target in targets:
        image.save(target, format='PNG', optimize=True, compress_level=9)
