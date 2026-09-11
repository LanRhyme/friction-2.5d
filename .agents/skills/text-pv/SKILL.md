---
name: text-pv
description: >-
  Friction 2.5D 文字 PV 动画制作专业指南，涵盖日文/中文动态排版（Kinetic Typography）、
  音乐卡点节奏系统（Beat Snapping）、25 种核心视觉特效与转场技法配方、
  物理下坠与排除混合、晶格碎裂与毛边粗糙化着色器、
  以及基于 JS API 与 MCP 的自动化排版动画流水线
---

# Friction 2.5D 文字 PV 动画设计与制作指南

文字 PV（Kinetic Typography Music Video）是一种融合动效设计、音乐节奏卡点与字体排印美学的矢量动画形式
本指南为 AI 智能体与开发者提供在 Friction 2.5D 中全流程制作高品质文字 PV 的核心规范、技术方案与代码配方

---

## 1. 工程规格与系统架构

- **标准画幅规格**：2400x1080（超宽 21:9 电影画幅）或 1920x1080（16:9 标准画幅）
- **基准帧率**：60 FPS（确保缓动超调与粒子晶格的丝滑物理质感）
- **画布背景**：统一采用纯黑 `#000000` 矢量矩形作为底色，便于实施 `Difference`（差值）与 `Exclusion`（排除）图层反色
- **字体规范**：
  - 正文排版：`Noto Serif CJK JP`（日文明朝体 / 中文宋体），呈现典雅笔锋与极高排版质感
  - 注释标注：`Noto Sans CJK JP`（日文黑体），清晰紧凑，适合右下角参数标注与技法解释
  - 汉字大字与假名小字比例：大汉字字号通常为 120-160pt，小假名字号通常为 48-64pt

---

## 2. 音乐卡点与时间轴标记系统（Beat Snapping）

高质感文字 PV 的核心灵魂在于视觉动效与音频强弱拍、瞬态信号（Transients）的绝对对齐

### 音轨导入与卡点注入规范
```javascript
// 1. 挂载无损原声音轨
scene.addSound("/path/to/audio.wav", "BGM");
scene.clearMarkers();

// 2. 注入三级时间轴节拍标记
function secToFrame(sec) { return Math.round(sec * 60); }

// 标记类型分级：
// - 镜头转换标记（Shot Cut）：用于全局镜头切换与画面重构
// - 节拍强拍标记（Beat）：对齐底鼓、钢琴强音、军鼓与人声起音
// - 动效触发标记（Impact）：对齐刚体落地、晶格炸裂、故障跳帧与弹性超调
scene.setMarker(secToFrame(0.0), "01_镜头入场");
scene.setMarker(secToFrame(1.17), "Beat: 钢琴强拍");
scene.setMarker(secToFrame(26.0), "Impact: 刚体落地");
scene.setMarker(secToFrame(53.5), "Impact: 玻璃碎裂");
```

---

## 3. 核心动效技法与代码配方库

### 技法 1：TextEvo 遮罩入场（Mask Stagger Reveal）
- **视觉特征**：底色框体横向滑出，单字依次向左滑入并伴随不透明度淡入
- **实现方案**：
```javascript
var box = scene.addRect("底框", -270, -55, 540, 110);
box.setFillColor("#ffffff");
box.setStrokeWidth(0);
box.property("position").setValueAtFrame(secToFrame(0.2), [620, 390]);
box.property("position").setValueAtFrame(secToFrame(0.8), [880, 390]);
box.property("position").setEasing("easeOutCubic", secToFrame(0.2), secToFrame(0.8));

var txt = scene.addText("文字", "例えば君が");
txt.setFontFamily("Noto Serif CJK JP");
txt.setFontSize(72);
txt.setFillColor("#000000");
txt.position().setValue([880, 390]);
txt.applyTextPreset("prop-pos-x-left", secToFrame(0.3), 0.7);
```

### 技法 2：双矩形遮罩轴错开（Dual-Mask Staggered Slide）
- **视觉特征**：白色底盒与蓝色装饰细条异步滑入，文字保持绝对静止，仅通过遮罩区域呈现
- **实现方案**：主框体先入，细色条（宽度 10-14px）稍滞后 0.1 秒滑出，形成前后景深拉伸感

### 技法 3：Textbox 框随字动与框随单字文本
- **视觉特征**：文本外框自动包络文本边界；或每个单字拥有专属独立小方块（灰底白边），单字弹性弹入
- **实现方案**：
```javascript
// 框随单字文本
var chars = ["笑", "っ", "て", "飛", "び", "込", "め", "る", "だ"];
var xs = [1120, 1210, 1290, 1390, 1480, 1570, 1660, 1740, 1820];
var ys = [440, 400, 470, 410, 480, 440, 520, 550, 580];

for (var i = 0; i < chars.length; i++) {
    var cbox = scene.addRect("框_" + i, -36, -36, 72, 72);
    cbox.setFillColor("#808080");
    cbox.setStrokeWidth(2.0);
    cbox.setStrokeColor("#ffffff");
    cbox.position().setValue([xs[i], ys[i]]);
    cbox.property("scale").setValueAtFrame(secToFrame(9.0 + i * 0.1), [0.0, 0.0]);
    cbox.property("scale").setValueAtFrame(secToFrame(9.3 + i * 0.1), [1.0, 1.0]);
    cbox.property("scale").setEasing("easeOutBack", secToFrame(9.0 + i * 0.1), secToFrame(9.3 + i * 0.1));

    var ctxt = scene.addText("字_" + i, chars[i]);
    ctxt.setFontFamily("Noto Serif CJK JP");
    ctxt.setFontSize(50);
    ctxt.setFillColor("#ffffff");
    ctxt.position().setValue([xs[i], ys[i]]);
    ctxt.property("position").setValueAtFrame(secToFrame(9.0 + i * 0.1), [xs[i], ys[i] + 25]);
    ctxt.property("position").setValueAtFrame(secToFrame(9.3 + i * 0.1), [xs[i], ys[i]]);
    ctxt.property("position").setEasing("easeOutBack", secToFrame(9.0 + i * 0.1), secToFrame(9.3 + i * 0.1));
}
```

### 技法 4：交替字符倾斜进入（Skew / Shear Matrix Transform）
- **视觉特征**：字符从上下两侧交错入场，并伴随 X 轴剪切倾角与回弹归零
- **实现方案**：
```javascript
var t = scene.addText("倾斜字", "二");
t.setFontSize(105);
t.skewX().setValueAtFrame(secToFrame(12.0), -24.0);
t.skewX().setValueAtFrame(secToFrame(12.6), 0.0);
t.skewX().setEasing("easeOutBack", secToFrame(12.0), secToFrame(12.6));
```

### 技法 5：汉字与假名大小强烈对比（Nisai_KanSamllIze）
- **视觉特征**：词组中核心汉字字号放大 2.5 至 3 倍，助词与尾缀假名字号收敛缩小，增强阅读视觉焦点
- **典型比例**：汉字（如「胸痛」）字号 140-160pt；假名（如「くなるよ」）字号 50-56pt

### 技法 6：Newton 刚体物理落地与排除模式（Difference Mode Invert）
- **视觉特征**：单字自画面顶端做自由落体运动，砸入白色刚体底盒并发生地面反弹与倾角微偏，在盒体内外呈现反色
- **实现方案**：
```javascript
var whiteBox = scene.addRect("底盒", -280, -120, 560, 240);
whiteBox.setFillColor("#ffffff");
whiteBox.position().setValue([840, 550]);

var dropChar = scene.addText("刚体_強", "強");
dropChar.setFontSize(96);
dropChar.setFillColor("#ffffff");
dropChar.setBlendMode("Difference"); // 在白色底盒内自动反转为纯黑

var p = dropChar.property("position");
p.setValueAtFrame(secToFrame(25.5), [680, 50]);   // 起始高空
p.setValueAtFrame(secToFrame(26.05), [680, 510]); // 触底冲击
p.setValueAtFrame(secToFrame(26.35), [680, 475]); // 向上反弹
p.setValueAtFrame(secToFrame(26.65), [680, 510]); // 稳定触底
p.setEasing("easeInQuad", secToFrame(25.5), secToFrame(26.05));
p.setEasing("easeOutQuad", secToFrame(26.05), secToFrame(26.35));
p.setEasing("easeInQuad", secToFrame(26.35), secToFrame(26.65));
```

### 技法 7：定格抽帧闪烁与轴错位（Hold-Strobe & Chromatic Shift）
- **视觉特征**：在白色字符下方垫一层偏移 10px 的青色 `#00e5ff` 或品红底字，白色图层按 3-4 帧间隔在不透明度 100 与 0 之间定格跳变

### 技法 8：毛边粗糙化（Roughen Edges）
- **视觉特征**：文字笔画边缘产生强烈的类似湿纸或墨水渗透的分形腐蚀与锯齿扩散
- **实现方案**：
```javascript
txt.addEffect("roughen_edges");
var border = txt.property("border");
border.setValueAtFrame(secToFrame(32.5), 2.0);
border.setValueAtFrame(secToFrame(33.5), 20.0);
border.setValueAtFrame(secToFrame(34.5), 45.0);
border.setEasing("easeInCubic", secToFrame(32.5), secToFrame(34.5));
```

### 技法 9：分形杂色置换与故障 RGB 分离（Glitch & Displacement Warp）
- **视觉特征**：多重散落字符叠加水平切片故障（Glitch）与流动置换扭曲（Displacement Warp）
- **实现方案**：
```javascript
txt.addEffect("glitch");
txt.addEffect("displacement_warp");
```

### 技法 10：蓝宝石 s_shake 高频震颤与 CC Smear 涂抹
- **视觉特征**：强重拍处单个巨大汉字产生高频随机震动抖动；下一阶段切换为平假名，通过横向涂抹特效将字形向右极限拉伸
- **实现方案**：
```javascript
// 震颤字
var shakeP = renTxt.property("position");
// 注入每帧 20-30px 高频振荡关键帧

// 涂抹字
souTxt.addEffect("smear");
var intensity = souTxt.property("intensity");
intensity.setValueAtFrame(secToFrame(42.2), 0.0);
intensity.setValueAtFrame(secToFrame(44.0), 100.0);
```

### 技法 11：Voronoi 晶格物理碎裂飞散（Shatter Explosion）
- **视觉特征**：巨大文字伴随重击音效碎裂为无数不规则晶格，沿爆炸抛物线向外炸飞并旋转散落，中心留空
- **实现方案**：
```javascript
txt.addEffect("shatter");
var prog = txt.property("progress");
prog.setValueAtFrame(secToFrame(53.0), 0.0);  // 完好
prog.setValueAtFrame(secToFrame(53.5), 0.12); // 微裂痕高光
prog.setValueAtFrame(secToFrame(54.4), 0.85); // 碎片向外爆炸飞离
prog.setEasing("easeOutQuad", secToFrame(53.5), secToFrame(54.4));
```

### 技法 12：3D 独立字符 Y 轴翻转（Individual 3D Billboard Rotation）
- **视觉特征**：字符依次在 3D 空间中自 -90 度沿垂直 Y 轴快速翻转归正
- **实现方案**：
```javascript
txt.set3DEnabled(true);
var ry = txt.rotationY();
ry.setValueAtFrame(t0, -90.0);
ry.setValueAtFrame(t1, 0.0);
ry.setEasing("easeOutBack", t0, t1);
```

### 技法 13：非等比弹性形变与阶梯抽帧（Squash & Stretch + Posterize）
- **视觉特征**：字符入场时产生剧烈的纵横挤压拉伸（如 `[1.5, 0.65] -> [0.85, 1.25] -> [1.0, 1.0]`），并挂载 `posterize` 特效模拟每秒 12-15 帧的动漫手绘跳帧质感

---

## 4. 自动化生成与调试工作流

- **生成执行脚本**：推荐采用 Python + Unix Socket IPC 模式，实时将完整工程或镜头片段注入 Friction
```bash
python3 tools/mcp/generate_exact_replica_pv.py
```
- **实时视口抓帧**：调用 `friction_capture_viewport` 检查每处关键帧构图、字号对比与特效渲染
- **缓动调试原则**：
  - 冲击与落地：前段采用 `easeInQuad` 模拟重力加速，回弹采用 `easeOutQuad`
  - 文本滑入：一律优先采用 `easeOutCubic` 或带有轻微超调的 `easeOutBack`
  - 路径巡航：采用 `easeInOutSine` 保证速度连续性

---

## 5. 文档与代码规范约束

- **严禁在 Markdown 与技术说明中使用任何句号（。）**
- **严禁在 Markdown 与技术说明中使用任何 Emoji**
- 保持列表精炼、技术术语精确，代码片段开箱即用
