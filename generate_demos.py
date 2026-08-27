import os
import math
import random
from PIL import Image, ImageDraw, ImageFilter

os.makedirs("demo_scans", exist_ok=True)

def create_sonar_palette_image(width=800, height=520, scan_type=1):
    # Sonar colormap generation: dark blue/black -> copper/amber -> bright golden yellow/cyan highlights
    img = Image.new("RGB", (width, height), (6, 16, 22))
    draw = ImageDraw.Draw(img)
    
    # Generate seabed texture with acoustic noise and scanning lines
    random.seed(scan_type * 42)
    pixels = img.load()
    
    # Base acoustic gradient
    for y in range(height):
        # sonar intensity curve (waterfall scan effect)
        center_dist = abs(y - height / 2) / (height / 2)
        base_intensity = int(25 + 40 * math.sin(y / 15.0) ** 2 + random.randint(0, 15))
        for x in range(width):
            # Seabed ripple texture
            noise = random.randint(-12, 12)
            ripple = int(18 * math.sin(x / 24.0 + y / 35.0) + 12 * math.cos(x / 40.0 - y / 20.0))
            
            # Water column swath line in center for side-scan sonar
            center_swath = math.exp(-((y - height / 2) ** 2) / 1200)
            
            val = max(10, min(240, base_intensity + ripple + noise))
            if center_swath > 0.4:
                val = int(val * 0.2) # dark nadir acoustic shadow
                
            # Copper / Amber sonar palette mapping
            r = int(val * 0.95)
            g = int(val * 0.72)
            b = int(val * 0.35 + 20)
            pixels[x, y] = (r, g, b)
            
    # Add targets and acoustic shadows based on scan_type
    if scan_type == 1:
        # Target 1: Ghost Fishing Net (complex acoustic bright cluster + trailing acoustic shadow)
        net_x, net_y = 280, 180
        # Shadow (dark behind target)
        for dx in range(120):
            for dy in range(-40, 50):
                sx, sy = net_x + 50 + dx, net_y + dy + int(dx * 0.15)
                if 0 <= sx < width and 0 <= sy < height:
                    r, g, b = pixels[sx, sy]
                    pixels[sx, sy] = (int(r * 0.15), int(g * 0.15), int(b * 0.15))
        # Bright acoustic return
        for _ in range(350):
            rx = net_x + random.randint(-45, 45)
            ry = net_y + random.randint(-35, 35)
            if 0 <= rx < width and 0 <= ry < height:
                pixels[rx, ry] = (255, 230 + random.randint(-20, 20), 120 + random.randint(0, 50))
        # Netting lines
        for i in range(8):
            draw.line([(net_x - 35 + i*10, net_y - 25), (net_x - 10 + i*8, net_y + 30)], fill=(255, 240, 180), width=2)
            draw.line([(net_x - 40, net_y - 20 + i*7), (net_x + 40, net_y - 10 + i*6)], fill=(255, 230, 160), width=1)
            
        # Target 2: Discarded Tire (Toroid shape)
        tire_x, tire_y = 560, 340
        # Tire Shadow
        draw.ellipse([tire_x + 25, tire_y - 15, tire_x + 90, tire_y + 25], fill=(8, 14, 16))
        # Tire acoustic reflection
        draw.ellipse([tire_x - 25, tire_y - 25, tire_x + 25, tire_y + 25], outline=(255, 240, 160), width=5)
        draw.ellipse([tire_x - 12, tire_y - 12, tire_x + 12, tire_y + 12], outline=(40, 30, 15), fill=(20, 18, 12), width=2)
        
    elif scan_type == 2:
        # Target 1: Industrial Metal Drums (Cylindrical reflections)
        d_x, d_y = 310, 240
        # Shadow
        draw.polygon([(d_x + 30, d_y - 30), (d_x + 140, d_y - 20), (d_x + 130, d_y + 40), (d_x + 30, d_y + 35)], fill=(6, 12, 14))
        # Bright Metal drum 1
        draw.rounded_rectangle([d_x - 30, d_y - 35, d_x + 30, d_y + 35], radius=6, outline=(255, 255, 200), fill=(230, 190, 80), width=3)
        draw.line([(d_x - 30, d_y - 10), (d_x + 30, d_y - 10)], fill=(255, 255, 220), width=2)
        draw.line([(d_x - 30, d_y + 15), (d_x + 30, d_y + 15)], fill=(255, 255, 220), width=2)
        
        # Target 2: Plastic Crate Array
        p_x, p_y = 540, 160
        draw.rectangle([p_x + 30, p_y - 20, p_x + 110, p_y + 40], fill=(8, 15, 18))
        for r in range(2):
            for c in range(3):
                cx = p_x - 35 + c * 25
                cy = p_y - 20 + r * 25
                draw.rectangle([cx, cy, cx + 20, cy + 20], outline=(255, 245, 170), fill=(200, 160, 60), width=2)
                
        # Target 3: Submerged Marine Rope / Entanglement
        r_x, r_y = 190, 370
        draw.line([(r_x - 50, r_y + 20), (r_x - 20, r_y - 10), (r_x + 20, r_y + 15), (r_x + 60, r_y - 20)], fill=(255, 230, 140), width=3)
        
    elif scan_type == 3:
        # Target 1: Ruptured Industrial Pipeline Segment
        pipe_y = 230
        # Shadow along the pipe
        draw.polygon([(120, pipe_y + 20), (680, pipe_y + 25), (680, pipe_y + 75), (120, pipe_y + 65)], fill=(5, 10, 12))
        # Long heavy pipe with rupture break
        draw.line([(100, pipe_y - 5), (340, pipe_y - 5)], fill=(255, 250, 190), width=8)
        draw.line([(100, pipe_y + 5), (340, pipe_y + 5)], fill=(210, 170, 70), width=6)
        
        # Fracture / gap
        draw.line([(380, pipe_y - 2), (700, pipe_y - 8)], fill=(255, 250, 190), width=8)
        draw.line([(380, pipe_y + 8), (700, pipe_y + 2)], fill=(210, 170, 70), width=6)
        
        # Target 2: Concrete Ballast / Metallic scrap
        b_x, b_y = 520, 380
        draw.polygon([(b_x + 25, b_y - 20), (b_x + 95, b_y - 10), (b_x + 85, b_y + 35), (b_x + 25, b_y + 30)], fill=(7, 14, 16))
        draw.polygon([(b_x - 30, b_y - 25), (b_x + 20, b_y - 30), (b_x + 30, b_y + 25), (b_x - 25, b_y + 20)], fill=(240, 200, 90), outline=(255, 255, 220))

    # Add telemetry HUD markings (frequency, range, timestamp)
    hud_draw = ImageDraw.Draw(img)
    # Range lines
    for i in range(1, 6):
        x_pos = int(width * (i / 6))
        hud_draw.line([(x_pos, 0), (x_pos, height)], fill=(40, 70, 80, 80), width=1)
        
    return img

img1 = create_sonar_palette_image(800, 520, 1)
img1.save("demo_scans/sonar_scan_1_ghostnet.jpg", quality=92)

img2 = create_sonar_palette_image(800, 520, 2)
img2.save("demo_scans/sonar_scan_2_drums_plastic.jpg", quality=92)

img3 = create_sonar_palette_image(800, 520, 3)
img3.save("demo_scans/sonar_scan_3_pipeline_debris.jpg", quality=92)

print("Generated 3 demo sonar scans successfully.")
