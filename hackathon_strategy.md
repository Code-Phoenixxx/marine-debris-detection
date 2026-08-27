# AI-Powered Automated Underwater Marine Debris & Anomaly Detection System
## Complete Hackathon Strategy & Execution Plan

---

## 1. Problem Interpretation & Understanding

### The Core Problem
The ocean floor is littered with **anthropogenic debris** — ghost nets, shipwrecks, pipes, cables, drums — that kills marine life, destroys coral reefs, and damages vessels. Finding this debris manually using sonar logs is like searching for a needle in a haystack... except the haystack is thousands of kilometers of noisy acoustic imagery.

### Why It's Hard (Technical Challenges)
| Challenge | What It Means |
|---|---|
| **Speckle Noise** | Sonar images are inherently grainy — acoustic signals scatter off particles in water, creating a salt-and-pepper noise pattern fundamentally different from camera noise |
| **Acoustic Shadows** | Objects cast dark "shadows" behind them in sonar imagery. These shadows are actually *useful* for detection but can also cause false positives when natural formations cast similar shadows |
| **Varying Resolution** | As the sonar swath widens, pixel resolution degrades at the edges (near-range vs far-range distortion). Objects look different depending on where they fall in the swath |
| **Data Dropouts** | Vehicle motion (heave, pitch, roll) causes gaps, streaks, and geometric distortions in the sonar mosaic |
| **Class Ambiguity** | A rock cluster can look like a pile of debris. A sand ripple can mimic a cable. Natural vs man-made separation is the fundamental challenge |

### What the Judges Want to See
1. You **understand sonar imagery** is NOT like optical imagery — different physics, different preprocessing
2. You can handle **real-world noise**, not just clean lab datasets
3. Your solution is **modular** — each component is independently testable
4. You're thinking about **edge deployment** — not just a beefy GPU server
5. You produce **actionable output** — geotagged reports, not just bounding boxes

---

## 2. System Architecture (End-to-End Pipeline)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE (Dashboard)                       │
│   Upload Sonar Logs → View Detections on Map → Download Reports         │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATION LAYER (FastAPI)                        │
│          Receives uploads, manages pipeline, serves results             │
└────────┬───────────────┬────────────────┬───────────────┬──────────────┘
         │               │                │               │
         ▼               ▼                ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  MODULE 1    │ │  MODULE 2    │ │  MODULE 3    │ │   MODULE 4       │
│ Preprocessing│→│  Detection   │→│  Confidence  │→│ Geotagging &     │
│ & Denoising  │ │  / Segment.  │ │  & Filtering │ │ Report Engine    │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────────┘
```

### Data Flow
```
Raw Sonar Image (.xtf/.jsf/.png)
  → Speckle Denoising (Lee/Frost filter)
  → Contrast Enhancement (CLAHE)
  → Resolution Normalization
  → Geometric Correction (motion compensation)
  → AI Model Inference (YOLOv8 or U-Net)
  → Post-processing (NMS, confidence thresholding)
  → False Positive Filtering (shadow analysis, morphological checks)
  → Metadata Parsing (lat/lon extraction from sonar headers)
  → Geotagged Report Generation (JSON/CSV)
  → Dashboard Visualization (map overlay)
```

---

## 3. Module-by-Module Breakdown

### Module 1: Preprocessing & Denoising Pipeline

**Purpose**: Transform raw, noisy sonar imagery into clean, normalized input suitable for AI inference.

**Techniques**:
| Technique | Purpose | Library |
|---|---|---|
| **Lee Filter** | Speckle noise reduction while preserving edges — the standard for SAR/sonar denoising | OpenCV (custom implementation) |
| **Frost Filter** | Adaptive speckle filter — better for heterogeneous seafloor textures | Custom NumPy/SciPy |
| **CLAHE** (Contrast Limited Adaptive Histogram Equalization) | Enhances local contrast — makes debris stand out from background | OpenCV `cv2.createCLAHE()` |
| **Slant-Range Correction** | Corrects geometric distortion from the sonar's conical beam geometry | Custom math (trigonometric correction) |
| **Bottom-Track Normalization** | Removes the intensity gradient from near-range to far-range | Sliding window mean normalization |
| **Tiling** | Splits large sonar mosaics into overlapping tiles (e.g., 640×640) for model inference | Custom Python |

**Why this matters for Q&A**: If asked "how do you handle noise?", you can explain that sonar speckle is **multiplicative noise** (unlike additive Gaussian noise in cameras), so standard denoising (e.g., Gaussian blur) destroys signal — you need domain-specific filters like Lee or Frost.

---

### Module 2: Object Detection / Semantic Segmentation Model

**Primary Approach: Two-Model Architecture** (this is your novelty angle)

#### Model A — YOLOv8-nano (Detection)
- **Task**: Draw bounding boxes around potential debris
- **Why YOLOv8**: State-of-the-art real-time detection, runs on edge devices, extensive community support
- **Why nano variant**: Optimized for edge deployment — ~3.2M params, runs at 50+ FPS on a Jetson Nano
- **Classes**: `ghost_net`, `shipwreck`, `pipe/cable`, `drum/cylinder`, `anchor`, `debris_cluster`, `unknown_anomaly`

#### Model B — U-Net with Attention Gates (Segmentation)
- **Task**: Pixel-level mask for precise shape delineation of detected objects
- **Why U-Net**: Gold standard for medical/sonar segmentation — handles small objects well
- **Attention Gates**: Help the model focus on relevant regions and ignore background noise
- **When it runs**: Only on cropped regions from YOLO detections (saves compute)

#### Why Two Models?
```
YOLO (fast, coarse) → Finds candidate regions quickly
U-Net (slower, precise) → Segments exact shape within candidates
```
This **cascaded approach** gives you:
- Speed of YOLO for real-time scanning
- Precision of U-Net for accurate boundary mapping
- Reduced compute since U-Net only processes small crops, not the full image

#### Training Strategy
- **Transfer Learning**: Start from COCO-pretrained YOLOv8 weights, fine-tune on sonar data
- **Data Augmentation**: Rotation, flipping, contrast jitter, synthetic speckle noise injection, cutout/mosaic augmentations
- **Loss Function**: For YOLO — CIoU loss + focal loss (handles class imbalance). For U-Net — Dice Loss + Binary Cross-Entropy (handles small object segmentation)

#### Alternative Models to Mention (shows breadth of knowledge)
| Model | Pros | Cons |
|---|---|---|
| Faster R-CNN | Very accurate, two-stage | Too slow for edge deployment |
| SSD | Fast | Lower accuracy on small objects |
| DeepLabv3+ | Strong segmentation | Heavy compute |
| RT-DETR | Transformer-based, very new | Less proven on sonar data |

---

### Module 3: Confidence Scoring & Noise Filtering

**Purpose**: Reduce false positives and assign a meaningful confidence score (0–100%) to each detection.

**Multi-Factor Confidence Score Formula**:
```
Final_Confidence = w1 × Model_Score + w2 × Shadow_Score + w3 × Morphology_Score + w4 × Context_Score
```

| Factor | What It Measures | How |
|---|---|---|
| **Model_Score** | Raw YOLO/U-Net confidence | Direct model output (softmax probability) |
| **Shadow_Score** | Whether the object casts an acoustic shadow consistent with a 3D object | Analyze the dark region behind the bright return — real objects cast shadows, noise doesn't |
| **Morphology_Score** | Whether the shape matches known man-made object geometry (straight lines, regular curves) | Contour analysis — circularity, rectangularity, edge sharpness (Hough transform) |
| **Context_Score** | Whether the surrounding seafloor context supports debris presence | Texture analysis of surrounding area — debris is usually on flat/sandy bottom, not on rocky ridges |

**Filtering Pipeline**:
1. Discard detections below 30% model confidence
2. Run shadow consistency check — reject if shadow geometry doesn't match object orientation
3. Run morphological filter — reject if shape is too irregular (likely rock)
4. Compute weighted final confidence score
5. Classify: **High (>75%)**, **Medium (50-75%)**, **Low (30-50%)**

> [!TIP]
> **Q&A Gold**: If asked "how do you reduce false positives?", explain that you don't just rely on the model's confidence — you use **domain-specific acoustic physics** (shadow analysis) to validate detections. This is what separates a good solution from a naive one.

---

### Module 4: Geotagging & Report Engine

**Purpose**: Parse sonar metadata to convert pixel coordinates to real-world lat/lon, and generate structured reports.

**How Geotagging Works**:
1. Side-scan sonar files (XTF, JSF formats) contain **ping headers** with GPS coordinates, heading, speed, altitude
2. Each pixel in the sonar image corresponds to a specific **across-track distance** (based on sample number and sound speed)
3. Combining along-track position (GPS + heading) with across-track offset → **latitude/longitude of each pixel**

**Report Output (JSON)**:
```json
{
  "scan_id": "survey_2024_reef_A",
  "timestamp": "2024-03-15T14:32:00Z",
  "detections": [
    {
      "id": "DET_001",
      "class": "ghost_net",
      "confidence": 87.3,
      "confidence_level": "HIGH",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "bounding_box": {"width_m": 4.2, "height_m": 2.8},
      "estimated_area_sqm": 11.76,
      "depth_m": 23.5,
      "shadow_length_m": 1.8,
      "thumbnail_path": "crops/DET_001.png"
    }
  ],
  "summary": {
    "total_detections": 14,
    "high_confidence": 8,
    "medium_confidence": 4,
    "low_confidence": 2,
    "scan_area_sqkm": 2.3
  }
}
```

**Libraries**:
- `pyxtf` — Python library for parsing XTF sonar files
- `pyproj` — Coordinate transformations (UTM to lat/lon)
- Standard `json` / `csv` modules for report generation

---

### Module 5: UI Dashboard

**Purpose**: Provide a visual interface to upload sonar logs, view AI detections on a map, and download reports.

**Tech Stack**:
| Component | Technology | Why |
|---|---|---|
| **Frontend** | React.js + Leaflet.js | Leaflet is the best open-source mapping library; React for component-based UI |
| **Map Tiles** | OpenStreetMap / ESRI Ocean Basemap | Ocean-specific map tiles show bathymetry and coastlines |
| **Backend API** | FastAPI (Python) | Async, fast, auto-generates OpenAPI docs, native Python integration with ML pipeline |
| **Real-time Updates** | WebSockets (via FastAPI) | Stream detection results to frontend as processing happens |
| **File Upload** | Multipart form upload with progress bar | Handle large sonar files (can be 100s of MB) |

**Dashboard Features**:
1. **Upload Panel**: Drag-and-drop sonar file upload with format validation
2. **Processing View**: Real-time progress bar showing preprocessing → detection → geotagging stages
3. **Map View**: Interactive map with detection markers (color-coded by confidence: 🔴 High, 🟡 Medium, 🟢 Low)
4. **Detail Panel**: Click on a detection marker → see cropped sonar image, class, confidence breakdown, coordinates
5. **Report Download**: One-click JSON/CSV download of all detections
6. **Statistics Panel**: Summary cards showing total detections, area scanned, detection breakdown by class
7. **Filter Controls**: Filter detections by class, confidence threshold, area

---

## 4. Complete Tech Stack Summary

### Core ML & Processing
| Tool | Version | Purpose |
|---|---|---|
| **Python** | 3.10+ | Primary language for entire backend |
| **PyTorch** | 2.x | Deep learning framework |
| **Ultralytics** | 8.x | YOLOv8 training & inference |
| **segmentation_models_pytorch** | latest | U-Net with attention gates |
| **OpenCV** | 4.x | Image processing, filtering, contour analysis |
| **NumPy / SciPy** | latest | Numerical computing, signal processing |
| **scikit-image** | latest | Advanced image processing (Lee filter, morphology) |
| **Albumentations** | latest | Data augmentation pipeline |

### Backend & API
| Tool | Purpose |
|---|---|
| **FastAPI** | REST API + WebSocket server |
| **Uvicorn** | ASGI server |
| **Celery + Redis** | Background task queue for processing large files |
| **pyxtf** | XTF sonar file parsing |
| **pyproj** | Coordinate system transformations |

### Frontend & Visualization
| Tool | Purpose |
|---|---|
| **React.js** | UI framework |
| **Leaflet.js** | Interactive mapping |
| **Chart.js** / **Recharts** | Statistics visualization |
| **Axios** | HTTP client for API calls |

### Edge Deployment
| Tool | Purpose |
|---|---|
| **ONNX Runtime** | Cross-platform model inference |
| **TensorRT** | NVIDIA GPU-optimized inference (Jetson) |
| **Docker** | Containerized deployment |

### Development & Collaboration
| Tool | Purpose |
|---|---|
| **Git / GitHub** | Version control |
| **Weights & Biases (wandb)** | Experiment tracking, model metrics |
| **Jupyter Notebooks** | Exploratory data analysis |
| **pytest** | Unit testing |

---

## 5. Dataset Strategy

### Public Sonar Datasets
| Dataset | Description | Size | Link |
|---|---|---|---|
| **Marine Debris Archive (Forward-Looking Sonar)** | Labeled debris objects in sonar imagery | ~1,500 images | Kaggle / research repos |
| **SCTD (Side-scan Sonar Target Detection)** | Side-scan sonar with labeled targets | ~4,000+ images | GitHub academic releases |
| **Watertight (Shipwreck Detection)** | Labeled shipwrecks in SSS imagery | ~500 images | Academic |
| **Synthetic Sonar (GAN-generated)** | Use CycleGAN to generate synthetic sonar training data from 3D models | Unlimited | Self-generated |

### Data Augmentation Strategy
Since sonar datasets are **small** compared to optical CV datasets, augmentation is critical:
- **Geometric**: Random rotation (0°–360°), horizontal/vertical flip, random crop, scaling
- **Intensity**: Brightness jitter, contrast adjustment, gamma correction
- **Noise**: Synthetic speckle noise injection, random dropout patches (simulating data loss)
- **Domain-specific**: Simulated acoustic shadow manipulation, slant-range distortion simulation
- **Advanced**: Mosaic augmentation (YOLO-style — stitch 4 images together), mixup

### Annotation Tools
- **CVAT** (Computer Vision Annotation Tool) — for bounding boxes
- **LabelMe** / **Labelbox** — for polygon segmentation masks
- **Roboflow** — for dataset management, versioning, and augmentation pipelines

---

## 6. Novelty & Innovation Angles 🌟

This is what will set you apart in the Q&A. Here are the key differentiators:

### Novelty 1: Cascaded Dual-Model Architecture
> Most solutions use either YOLO **or** U-Net. You use **both in cascade** — YOLO for fast candidate detection, U-Net for precise segmentation only on candidate regions. This gives speed + precision while saving compute.

### Novelty 2: Physics-Informed Confidence Scoring
> You don't just rely on model confidence. Your scoring system incorporates **acoustic shadow physics** — validating that a detected object's shadow is geometrically consistent with the sonar geometry (incidence angle, altitude, range). This is a **domain-specific innovation** that reduces false positives from rock formations.

### Novelty 3: Edge-First Design Philosophy
> The entire pipeline is designed for deployment on an **NVIDIA Jetson Orin Nano** or similar edge device. Models are exported to ONNX/TensorRT, preprocessing is optimized with OpenCV CUDA, and the pipeline runs without cloud connectivity. This enables **real-time onboard processing** on AUVs.

### Novelty 4: Synthetic Data Generation via CycleGAN
> To overcome the scarcity of labeled sonar data, you use **CycleGAN** to translate 3D-rendered underwater scenes into realistic sonar imagery, creating unlimited training data while maintaining physical consistency.

### Novelty 5: Acoustic Shadow as a Feature, Not a Bug
> While most CV systems treat shadows as noise, your system **explicitly analyzes shadow characteristics** (length, orientation, intensity profile) as a primary feature for 3D shape estimation and object classification. A ghost net casts a very different shadow than a cylinder or a rock.

---

## 7. Edge Deployment Strategy

### Target Hardware
| Device | Specs | Use Case |
|---|---|---|
| **NVIDIA Jetson Orin Nano** | 40 TOPS, 8GB RAM | Onboard AUV processing |
| **Raspberry Pi 5 + Coral TPU** | Budget option | Lightweight pre-screening |
| **Intel NUC with OpenVINO** | x86 edge computing | Ship-mounted processing station |

### Optimization Pipeline
```
PyTorch Model (.pt)
  → Export to ONNX (.onnx)
  → Quantize to INT8 (reduces size by 4x, speeds up 2-3x)
  → Convert to TensorRT (.engine) for Jetson
  → Benchmark: Target <100ms per frame
```

### Model Size Targets
| Model | Full (FP32) | Quantized (INT8) | Target FPS (Jetson) |
|---|---|---|---|
| YOLOv8-nano | ~6 MB | ~2 MB | 50+ FPS |
| U-Net (attention) | ~30 MB | ~8 MB | 15+ FPS |

---

## 8. Execution Timeline (Hackathon Sprint Plan)

### Phase 1: Foundation (Day 1-2)
- [ ] Set up repository structure, virtual environments, CI/CD
- [ ] Download and organize sonar datasets
- [ ] Implement preprocessing pipeline (Lee filter, CLAHE, tiling)
- [ ] Set up annotation pipeline for any unlabeled data

### Phase 2: Model Development (Day 3-5)
- [ ] Train YOLOv8-nano on sonar dataset with transfer learning
- [ ] Train U-Net segmentation model on cropped regions
- [ ] Implement cascaded inference pipeline
- [ ] Run evaluation (mAP, IoU, precision/recall)

### Phase 3: Post-Processing & Backend (Day 5-6)
- [ ] Build confidence scoring module (shadow analysis + morphology)
- [ ] Implement geotagging engine (XTF parsing + coordinate mapping)
- [ ] Build FastAPI backend with file upload + processing endpoints
- [ ] Generate JSON/CSV report output

### Phase 4: Dashboard & Integration (Day 6-7)
- [ ] Build React frontend with Leaflet map
- [ ] Integrate WebSocket real-time updates
- [ ] Add detection overlay on map + detail panel
- [ ] Implement report download functionality

### Phase 5: Edge Optimization & Demo (Day 7-8)
- [ ] Export models to ONNX → TensorRT
- [ ] Benchmark on edge device (if available) or simulate
- [ ] End-to-end demo run with sample sonar data
- [ ] Record demo video

---

## 9. Project Structure

```
marine-debris-detection/
├── README.md
├── requirements.txt
├── docker-compose.yml
├── config/
│   ├── model_config.yaml          # Model hyperparameters
│   └── pipeline_config.yaml       # Processing pipeline settings
├── data/
│   ├── raw/                       # Raw sonar files
│   ├── processed/                 # Preprocessed tiles
│   ├── annotations/               # YOLO/COCO format labels
│   └── augmented/                 # Augmented training data
├── src/
│   ├── preprocessing/
│   │   ├── denoising.py           # Lee, Frost, median filters
│   │   ├── enhancement.py         # CLAHE, normalization
│   │   ├── correction.py          # Slant-range, motion compensation
│   │   └── tiling.py              # Image tiling with overlap
│   ├── models/
│   │   ├── yolo_detector.py       # YOLOv8 training & inference wrapper
│   │   ├── unet_segmentor.py      # U-Net with attention gates
│   │   └── cascade_pipeline.py    # Cascaded YOLO → U-Net inference
│   ├── postprocessing/
│   │   ├── confidence_scorer.py   # Multi-factor confidence scoring
│   │   ├── shadow_analyzer.py     # Acoustic shadow validation
│   │   ├── morphology_filter.py   # Shape-based false positive filter
│   │   └── nms.py                 # Non-maximum suppression
│   ├── geotagging/
│   │   ├── xtf_parser.py          # XTF sonar file parser
│   │   ├── coordinate_mapper.py   # Pixel-to-GPS coordinate mapping
│   │   └── report_generator.py    # JSON/CSV report output
│   ├── api/
│   │   ├── main.py                # FastAPI application
│   │   ├── routes.py              # API endpoints
│   │   └── websocket.py           # Real-time updates
│   └── utils/
│       ├── visualization.py       # Detection overlay rendering
│       └── metrics.py             # mAP, IoU, precision/recall
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapView.jsx        # Leaflet map with detection markers
│   │   │   ├── UploadPanel.jsx    # File upload interface
│   │   │   ├── DetailPanel.jsx    # Detection detail view
│   │   │   └── StatsPanel.jsx     # Summary statistics
│   │   └── App.jsx
│   └── package.json
├── notebooks/
│   ├── 01_data_exploration.ipynb
│   ├── 02_preprocessing_demo.ipynb
│   └── 03_model_evaluation.ipynb
├── edge/
│   ├── export_onnx.py             # PyTorch → ONNX export
│   ├── optimize_tensorrt.py       # ONNX → TensorRT conversion
│   └── benchmark.py               # Edge device benchmarking
└── tests/
    ├── test_preprocessing.py
    ├── test_detection.py
    └── test_geotagging.py
```

---

## 10. Q&A Preparation — Anticipated Questions & Strong Answers

### Q: "Why did you choose YOLOv8 over other detection models?"
**A**: YOLOv8 offers the best accuracy-to-speed tradeoff for our edge deployment constraint. The nano variant has only 3.2M parameters and achieves real-time performance on NVIDIA Jetson hardware. For a system that needs to run onboard an AUV without cloud connectivity, this is critical. We also leverage its anchor-free detection head, which handles the varying aspect ratios of marine debris better than anchor-based detectors.

### Q: "How do you handle the scarcity of labeled sonar data?"
**A**: Three-pronged approach: (1) **Transfer learning** from COCO-pretrained weights — low-level features like edges and textures transfer well even across domains. (2) **Aggressive data augmentation** including domain-specific augmentations like synthetic speckle injection and shadow manipulation. (3) **Synthetic data generation** using CycleGAN to translate rendered underwater scenes into realistic sonar imagery.

### Q: "What makes your solution different from just running YOLO on sonar images?"
**A**: Three key differentiators. First, our **cascaded architecture** (YOLO → U-Net) gives both speed and pixel-level precision. Second, our **physics-informed confidence scoring** uses acoustic shadow analysis — we validate detections against sonar physics, not just model probability. Third, our **preprocessing pipeline** is specifically designed for sonar — standard image preprocessing would actually degrade performance because sonar noise is multiplicative, not additive.

### Q: "How do you reduce false positives from rock formations?"
**A**: Multiple layers: (1) **Shadow consistency check** — a rock casts a different shadow profile than a net or cylinder based on its 3D geometry. (2) **Morphological analysis** — man-made objects have straighter edges, higher circularity, and more regular contours than natural formations. (3) **Texture context scoring** — we analyze the surrounding seafloor texture; debris on a sandy bottom is high confidence, "debris" on a rocky ridge is likely a false positive.

### Q: "Can this really run on an edge device?"
**A**: Yes. YOLOv8-nano quantized to INT8 is approximately 2MB and runs at 50+ FPS on an NVIDIA Jetson Orin Nano. The U-Net only processes small cropped regions (not the full image), keeping it under 100ms per detection. Total pipeline latency target is under 200ms per sonar frame, which is faster than the typical sonar ping rate of 5-10 Hz.

### Q: "How accurate is the geotagging?"
**A**: Geotagging accuracy depends on the GPS quality of the sonar platform. Typical survey-grade GPS gives ±2m accuracy. Our pixel-to-coordinate mapping adds a small additional error based on the across-track resolution (typically 5-15cm per pixel for survey-grade SSS). Total position accuracy of a detected object is typically ±3-5 meters, which is sufficient for a dive team or ROV to locate the debris.

### Q: "What's your evaluation metric?"
**A**: We use **mAP@0.5** (mean Average Precision at 50% IoU threshold) as the primary metric for detection, and **Dice coefficient** for segmentation quality. We also track **false positive rate per km²** — this is the operationally meaningful metric, because a system that flags too many false positives will be ignored by cleanup crews.

### Q: "What if you don't have sonar metadata for geotagging?"
**A**: Graceful degradation. If full XTF metadata is unavailable (e.g., the user uploads a simple PNG screenshot), we still run detection and segmentation, but output pixel coordinates instead of GPS coordinates. The report clearly flags that geotagging was unavailable. The dashboard still shows the annotated image, just without map overlay.

### Q: "How would you deploy this in a real-world scenario?"
**A**: Three deployment modes: (1) **Onboard AUV** — edge device processes sonar in real-time, stores detections locally, uploads reports when surfaced. (2) **Ship-mounted workstation** — processes sonar feed from towed SSS in near-real-time. (3) **Post-mission analysis** — desktop/cloud-based batch processing of recorded sonar logs via the web dashboard.

---

## 11. PPT Slide Structure (Suggested)

| Slide # | Title | Content |
|---|---|---|
| 1 | Title Slide | Project name, team name, tagline: *"Turning sonar noise into ocean cleanup intelligence"* |
| 2 | The Problem | Ghost nets, marine debris impact, statistics (640,000 tons of ghost gear annually) |
| 3 | Why Current Methods Fail | Manual inspection bottleneck, human error rates, acoustic image challenges |
| 4 | Our Solution — Overview | High-level architecture diagram (the pipeline flow) |
| 5 | Technical Deep Dive — Preprocessing | Lee/Frost filters, CLAHE, why sonar ≠ camera |
| 6 | Technical Deep Dive — AI Models | Cascaded YOLO + U-Net architecture, why two models |
| 7 | Technical Deep Dive — Confidence Scoring | Physics-informed scoring, shadow analysis |
| 8 | Geotagging & Reports | XTF parsing, coordinate mapping, JSON output example |
| 9 | Dashboard Demo | UI mockup/screenshot showing map view with detections |
| 10 | Edge Deployment | ONNX/TensorRT pipeline, Jetson benchmarks, why edge matters |
| 11 | Novelty & Innovation | 5 key differentiators (cascaded architecture, physics-informed scoring, edge-first, synthetic data, shadow-as-feature) |
| 12 | Dataset & Training Strategy | Public datasets, augmentation, synthetic data via CycleGAN |
| 13 | Tech Stack | Clean visual of all technologies used |
| 14 | Timeline & Milestones | Sprint plan with phases |
| 15 | Future Scope | Multi-beam sonar support, temporal tracking (same debris across surveys), integration with marine conservation databases, autonomous cleanup drone coordination |
| 16 | Thank You / Q&A | Team details, GitHub link |

---

## 12. Key Statistics to Cite in PPT / Q&A

- **640,000+ tonnes** of fishing gear is lost or abandoned annually (FAO)
- Ghost nets account for **~10% of all marine litter** by volume
- A single ghost net can continue killing marine life for **600+ years**
- Manual sonar log review processes only **~5 km of seafloor per hour**
- An AI system can process **50+ km per hour** in real-time
- The global underwater debris remediation market is valued at **$XX billion** (growing)
- NOAA estimates there are **~22,000 tons** of debris in the Great Lakes alone
- Ghost nets are responsible for the death of **~100,000 whales, dolphins, seals** annually (World Animal Protection)

---

## 13. Risk Mitigation

| Risk | Mitigation |
|---|---|
| Insufficient labeled sonar data | Transfer learning + CycleGAN synthetic data + aggressive augmentation |
| High false positive rate | Multi-factor confidence scoring with shadow analysis |
| Edge device unavailable for demo | Run ONNX inference on CPU and show TensorRT benchmarks from literature |
| XTF parsing complexity | Fall back to image-only mode with pixel coordinates |
| Large sonar file upload issues | Implement chunked upload with progress bar, set max file size |
| Model overfitting on small dataset | Early stopping, dropout, cross-validation, augmentation |

---

> [!IMPORTANT]
> **The single most important thing for the internal round**: Show that you understand the **domain** — that sonar imagery has fundamentally different characteristics from optical images, and that your solution accounts for this at every stage (preprocessing, detection, confidence scoring). This domain awareness is what separates a top-tier submission from a generic "YOLO on images" approach.
