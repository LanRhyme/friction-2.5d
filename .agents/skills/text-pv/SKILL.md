---
name: text-pv
description: >-
  Comprehensive, battle-tested engineering guide for creating kinetic typography (Text PV)
  and music visualizer animations in Friction 2.5D, featuring multi-lingual typographic systems,
  timeline beat-snapping workflows, 30+ visual effect and motion design recipes,
  physics-driven rigid body simulations, GPU shader distortions, and script automation
---

# Friction 2.5D Kinetic Typography & Text PV Engineering Guide

Kinetic Typography Music Videos (Text PV) combine expressive typography, audio synchronization, graphic design, and physics-driven motion graphics
This skill equips AI agents and motion designers with deep technical recipes, mathematical formulas, and scripting patterns to craft high-impact text animations in Friction 2.5D

--------------------------------------------------------------------------------

## 1. Project Specifications & User-Driven Principles

### Resolution & Aspect Ratio Standards
- **Default Resolution**: 1920x1080 (Standard 16:9 Full HD) or 2560x1440 (2K QHD)
- **Dynamic Project Detection**: Always inspect active scene dimensions (`scene.width`, `scene.height`) or respect user-specified aspect ratios:
  - 16:9 Standard widescreen (`1920x1080`, `2560x1440`, `3840x2160`)
  - 9:16 Vertical mobile video (`1080x1920` for TikTok, YouTube Shorts, Reels)
  - 21:9 Anamorphic cinematic (`2400x1080`, `2560x1080`)
  - 1:1 Square social feed (`1080x1080`)
- **Frame Rate**: Default to 60 FPS for ultra-smooth easing curves, sub-frame interpolation, and physics particle simulations
- **Background Layer**: Use a full-canvas vector rectangle (`scene.addRect`) set to `#000000` or the user's selected palette, providing a reliable backdrop for `Difference` and `Exclusion` invert blend modes

### User-First Creative Freedom & Clarification Flow
- Never force a single rigid visual aesthetic or color scheme
- When user requirements are unspecified, proactively present targeted design choices:
  - Typography style: Classical Mincho / Songti, Modern Gothic / Grotesk, Brutalist Display, or Handwriting
  - Color palette: High-contrast monochrome, vibrant Cyberpunk neon, pastel Morandi, or warm retro film
  - Animation temperament: Snappy aggressive cuts, fluid organic liquid drift, or rhythmic anime step-frame cadence

--------------------------------------------------------------------------------

## 2. Audio Rhythm, Beat Snapping & Timeline Marker Architecture

Musical synchronization is the foundation of kinetic typography

### Audio Pipeline Integration
```javascript
// Load pristine lossless background audio track
scene.addSound("/path/to/audio.wav", "BGM_Main")
scene.clearMarkers()

var FPS = scene.fps || 60
function secToFrame(sec) { return Math.round(sec * FPS) }
```

### Three-Tier Marker Hierarchy
- **Tier 1: Sectional Cut Markers (Shot Transitions)**
  - Placed on verse, chorus, bridge, and drop transitions
  - Trigger global camera movements, color inversions, and scene layout replacements
- **Tier 2: Metric Pulse Markers (Rhythmic Beats)**
  - Synchronized to downbeats, snare hits, kick punch, and transient peaks
  - Drive character entrance timing, scale pulses, and flash strobes
- **Tier 3: Impact & Transient Markers (Micro-Dynamic Triggers)**
  - Synchronized to vocal articulation, bass drops, glass shatter bursts, and rigid body collisions
  - Drive sub-frame secondary motion, easing rebounds, and glitch bursts

### Beat Subdivision Formula
$$\Delta t_{\text{bar}} = \frac{240}{\text{BPM}} \quad (\text{seconds per 4/4 bar})$$
$$\Delta t_{\text{beat}} = \frac{60}{\text{BPM}} \quad (\text{quarter note downbeat})$$
$$\Delta t_{\text{8th}} = \frac{30}{\text{BPM}}, \quad \Delta t_{\text{16th}} = \frac{15}{\text{BPM}}, \quad \Delta t_{\text{triplet}} = \frac{20}{\text{BPM}}$$

--------------------------------------------------------------------------------

## 3. Typographic Systems & Spatial Composition

### Multi-Lingual Font Pairing Guidelines
- **Japanese Mincho / Chinese Songti**:
  - Primary: `Noto Serif CJK JP`, `Source Han Serif`, `Yu Mincho`
  - Evokes elegance, classical gravitas, dramatic vocal intensity, and traditional literary depth
- **Japanese Gothic / Modern Sans-Serif**:
  - Primary: `Noto Sans CJK JP`, `Source Han Sans`, `Hiragino Sans`, `Inter`, `Montserrat`
  - Evokes contemporary urban energy, fast-paced electronic genres, and technical HUD readouts
- **Display & Monospace Accents**:
  - Primary: `JetBrains Mono`, `Bebas Neue`, `Cinzel`, `Impact`
  - Ideal for background serial numbers, song credits, BPM counters, and glitch artifacts

### Hierarchical Layout Patterns
- **Kanji vs Kana Scale Contrast (Nisai_KanSamllIze Pattern)**:
  - Hero Kanji characters scaled to 140-180pt for prominent semantic weight
  - Grammatical Kana particles scaled to 45-60pt and positioned along the optical center
- **Vertical Multi-Column Japanese / Chinese Typography**:
  - Traditional vertical flow along $Y$ axis with staggered entrance delays along $X$ axis
  - Coupled with two-stage overshoot easing on arrival
- **Dynamic Bounding Box Auto-Padding (Textbox Paradigm)**:
  - Rectangular stroke or fill elements bound to text metrics
  - Scaled proportionally with text content to form clean graphic badges

--------------------------------------------------------------------------------

## 4. Comprehensive Kinetic Typography Repertoire (30 Core Techniques)

### Category A: Masking, Reveal & Handwriting Mechanics

#### 1. TextEvo Directional Mask & Opacity Slide
- Mask box travels outward while glyphs glide along opposite axis with per-glyph opacity stagger
```javascript
var box = scene.addRect("RevealMask", -300, -60, 600, 120)
box.setFillColor("#ffffff")
box.setStrokeWidth(0)
box.property("position").setValueAtFrame(secToFrame(0.0), [700, 540])
box.property("position").setValueAtFrame(secToFrame(0.6), [960, 540])
box.property("position").setEasing("easeOutCubic", secToFrame(0.0), secToFrame(0.6))

var txt = scene.addText("TextLayer", "例えば君が")
txt.setFontFamily("Noto Serif CJK JP")
txt.setFontSize(80)
txt.setFillColor("#000000")
txt.position().setValue([960, 540])
txt.applyTextPreset("prop-pos-x-left", secToFrame(0.1), 0.6)
```

#### 2. Dual-Layer Offset Mask Stagger
- Main background box slides horizontally, followed 4 frames later by an accent stripe (width 8-16px), while text remains static behind the clipping boundary

#### 3. Single-Character Bounding Box Array
- Each glyph is seated inside an individual square or capsule graphic (e.g. 72x72px with neutral gray `#808080` fill and `#ffffff` border), popping up with `easeOutBack`

#### 4. SubPath Trim Paths Handwriting Reveal
- Uses `addPathEffect("trim")` on vector stroke geometry or progressive horizontal wipe to simulate dynamic hand-lettered ink revelation
```javascript
pathLayer.addPathEffect("trim", {
    start: 0,
    end: 100,
    endKeys: [[secToFrame(1.0), 0], [secToFrame(2.2), 100]]
})
```

#### 5. Hollow Stroke Transition Matte with Fill Fill-In
- Dual text layers: background layer retains static hollow stroke (`fill: none, stroke: #ffffff, width: 2.5`), while foreground layer wipes solid white fill across the characters

#### 6. Radial Polar & Iris Reveal
- Circular mask expansion or rotational sweep revealing text outward from the center point

---

### Category B: Geometric, Matrix & Spatial Transformations

#### 7. Alternating Bilateral Skew / Shear Matrix Transform
- Characters enter from alternating top/bottom offsets while distorted by dynamic $X$-shear matrix tilt, snapping back to zero shear upon arrival
```javascript
var sk = layer.skewX()
sk.setValueAtFrame(secToFrame(2.0), -24.0)
sk.setValueAtFrame(secToFrame(2.6), 0.0)
sk.setEasing("easeOutBack", secToFrame(2.0), secToFrame(2.6))
```

#### 8. Non-Uniform Elastic Squash & Stretch
- Impactful arrivals compress along movement axis and expand perpendicularly to preserve apparent visual volume
```javascript
var sc = layer.scale()
sc.setValueAtFrame(secToFrame(0.0), [0.2, 0.2])
sc.setValueAtFrame(secToFrame(0.3), [1.55, 0.65])
sc.setValueAtFrame(secToFrame(0.5), [0.85, 1.25])
sc.setValueAtFrame(secToFrame(0.7), [1.0, 1.0])
```

#### 9. Secondary Two-Stage Overshoot Recoil
- Fast primary impulse passes the resting target coordinate by 10-15%, followed by an exponential damped return
$$x(t) = x_{\text{target}} + A \cdot e^{-\zeta \omega t} \cos(\omega_d t)$$

#### 10. Individual 3D Character Y-Axis Billboard Rotation
- Splits phrases into standalone glyph layers, enabling true 2.5D billboard transform (`set3DEnabled(true)`) and staggering Y-rotation from $-90^\circ$ to $0^\circ$
```javascript
glyph.set3DEnabled(true)
glyph.rotationY().setValueAtFrame(secToFrame(1.0), -90.0)
glyph.rotationY().setValueAtFrame(secToFrame(1.6), 0.0)
glyph.rotationY().setEasing("easeOutBack", secToFrame(1.0), secToFrame(1.6))
```

#### 11. Multi-Plane 2.5D Depth Parallax
- Foreground text positioned at $Z = -400$, midground text at $Z = 0$, and background decorative numbers at $Z = 800$, moving camera across scene with realistic optical parallax

#### 12. Spline Follow-Path Kinetic Alignment
- Binds text layer position and auto-rotation along cubic Bezier paths (`scene.addPath`) across undulating wave trajectories

---

### Category C: Physics, Collision & Particle Systems

#### 13. Newtonian Rigid-Body Free Fall & Floor Rebound
- Characters fall from out-of-screen ceiling under gravity acceleration ($g = 9.8\text{m/s}^2$), striking collision floor with rebound dampening and slight tilt rotation

#### 14. Difference / Exclusion Blend Mode Contrast Inversion
- Sets text blend mode to `Difference` or `Exclusion` over contrasting geometric obstacles; text automatically turns black inside white boxes and white over black voids
```javascript
dropText.setBlendMode("Difference")
```

#### 15. Voronoi Crystal Shatter Explosion
- GPU-accelerated Voronoi cell decomposition where fragments scatter along explosive parabolas with independent angular velocities and gravity decay, leaving a hollowed void at center
```javascript
shatterLayer.addEffect("shatter")
var prog = shatterLayer.property("progress")
prog.setValueAtFrame(secToFrame(5.0), 0.0)
prog.setValueAtFrame(secToFrame(5.4), 0.12)
prog.setValueAtFrame(secToFrame(6.2), 0.85)
prog.setEasing("easeOutQuad", secToFrame(5.4), secToFrame(6.2))
```

#### 16. Floating Kana Particle Drift (GlyphGlide Paradigm)
- Disperses kana characters randomly in a wide coordinate cloud with subtle continuous Brownian drift and alpha transparency variations (60-80%)

---

### Category D: Shaders, Distortions & Stylistic Glitch

#### 17. Roughen Edges Fractal fBm Erosion
- Multi-octave fractal Brownian motion noise corrupts the text alpha boundary, producing an ink-bleed, acid-etched, or worn paper edge
```javascript
textLayer.addEffect("roughen_edges")
var border = textLayer.property("border")
border.setValueAtFrame(secToFrame(3.0), 2.0)
border.setValueAtFrame(secToFrame(4.5), 45.0)
border.setEasing("easeInCubic", secToFrame(3.0), secToFrame(4.5))
```

#### 18. Turbulent Displacement Liquification
- Displaces image texture via perlin gradient fields, smoothly liquifying and deforming glyphs during vocal vibrato and vocal transitions
```javascript
textLayer.addEffect("displacement_warp")
var amt = textLayer.property("amount")
amt.setValueAtFrame(secToFrame(10.0), 0.0)
amt.setValueAtFrame(secToFrame(11.2), 85.0)
```

#### 19. Sapphire S_Shake High-Frequency Camera Jitter
- Rapid sub-frame coordinate perturbations ($\pm 25\text{px}$) applied on loud vocal spikes or heavy bass drops to convey violent acoustic resonance

#### 20. CC Smear Lateral Drag & Directional Melting
- Radial or unidirectional pixel pulling that extends trailing edges of characters across screen boundaries on sustained vocal vowels
```javascript
textLayer.addEffect("smear")
textLayer.property("intensity").setValueAtFrame(secToFrame(12.0), 0.0)
textLayer.property("intensity").setValueAtFrame(secToFrame(13.5), 100.0)
```

#### 21. Rowbyte Separate RGB & Digital Glitch
- Splits RGB channels horizontally while slicing random scanline blocks across text during beat dropouts or breakdown sections
```javascript
textLayer.addEffect("glitch")
```

#### 22. Deep Glow Volumetric Bloom & Letterspacing Expansion
- Combines optical glow, gaussian blur, and dynamic character tracking expansion (`letterSpacing` keyframing from 0.05 to 0.35)
```javascript
textLayer.addEffect("glow")
textLayer.addEffect("blur")
textLayer.setLetterSpacing(0.25)
```

#### 23. Hold-Strobe Frame Flashing
- Rapid square-wave keyframing of opacity (`100% -> 0% -> 100% -> 0%`) every 2-4 frames accompanied by chromatic hue shifts

#### 24. Posterize Anime Step-Frame Cadence
- Drops apparent motion frame rate down to 12 or 15 FPS via `posterize` filter, imbuing vector motion with a stylized hand-drawn anime aesthetic
```javascript
textLayer.addEffect("posterize")
```

#### 25. Repeater Clone Cascade with Multiplied Gradient
- Stacks multiple vertical or horizontal ghost instances of text with decaying alpha steps (`100% -> 80% -> 60% -> 40% -> 20%`)

#### 26. Specular Light Sweep Gleam
- Glint angle passing across typography faces on dramatic accent beats

--------------------------------------------------------------------------------

## 5. Friction 2.5D Scripting API Reference

### Scene & Timeline Management
- `scene.width`, `scene.height`: Canvas dimensions in pixels
- `scene.fps`: Playback and rendering frame rate
- `scene.duration`: Total scene duration in seconds
- `scene.addText(name, content)`: Creates a text layer proxy
- `scene.addRect(name, x, y, width, height)`: Creates a vector rectangle
- `scene.addPath(name, nodes, closed)`: Creates a vector spline path
- `scene.addSound(path, name)`: Attaches audio track to timeline
- `scene.setMarker(frame, label)`: Places named timeline marker
- `scene.clearMarkers()`: Removes all markers

### Layer Manipulation
- `layer.position()`: QPointFAnimator proxy for position $[X, Y]$
- `layer.scale()`: QPointFAnimator proxy for scale $[S_x, S_y]$
- `layer.rotation()`: Scalar rotation animator in degrees
- `layer.skew()`, `layer.skewX()`, `layer.skewY()`: Shear matrix animators
- `layer.rotationX()`, `layer.rotationY()`: 2.5D billboard rotation angles
- `layer.zPosition()`, `layer.perspective()`: 3D depth and focal distance
- `layer.opacity`: Direct scalar layer opacity (0-100)
- `layer.setInPoint(frame)`, `layer.setOutPoint(frame)`: Clipping boundaries
- `layer.setBlendMode(mode)`: Blend mode (`"Normal"`, `"Difference"`, `"Exclusion"`, `"Multiply"`, `"Screen"`)
- `layer.addEffect(type)`: Attaches GPU raster effect
- `layer.addPathEffect(type, settings)`: Attaches vector modifier (`"dash"`, `"trim"`)

### Keyframe Interpolation & Easing Presets
- `easeLinear`: Constant rate interpolation
- `easeInQuad`, `easeOutQuad`, `easeInOutQuad`: Parabolic velocity curves
- `easeInCubic`, `easeOutCubic`, `easeInOutCubic`: Standard smooth animation curves
- `easeInExpo`, `easeOutExpo`: Dramatic explosive acceleration
- `easeOutBack`: Overshoot bounce (essential for pop-ins and kinetic snaps)
- `easeInOutSine`: Soft wave transitions

--------------------------------------------------------------------------------

## 6. Execution & Verification Workflow

1. **Verify Canvas & Preferences**: Read active scene specifications or prompt the user if aspect ratio or font preferences are ambiguous
2. **Construct Payload Script**: Assemble cleanly scoped JavaScript payload avoiding global namespace collisions
3. **IPC Dispatch**: Send payload via Unix socket (`/tmp/friction_mcp.sock`) using `friction_eval_script`
4. **Multimodal Visual Inspection**: Call `friction_seek_timeline` and `friction_capture_viewport` to verify critical keyframes, typography legibility, and shader rendering
5. **Iterative Refinement**: Adjust easing boundaries, tracking offsets, and effect amplitudes based on visual playback review
