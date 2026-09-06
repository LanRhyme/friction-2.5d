/* ============================================================
   地图划线 — AE「地图划线CEP」移植版
   生成地图路线标注线：虚线中线 + 边线/道路矩形框 + 头尾端点形状
   模式：经典路感 / 双层叠压 / 道路标识；虚线自动流动动画
   ============================================================ */

(function () {
    var GROUP_NAME = "地图划线";

    var debugLog = [];
    function log(msg) {
        debugLog.push(msg);
        print(msg);
        if (debugLog.length > 300) { debugLog.shift(); }
    }

    // ---------------- 参数状态（CEP 预设 1 为默认） ----------------
    var state = {
        mode: 1,            // 1=经典路感 2=双层叠压 3=道路标识
        v1: 8,              // 中线宽度
        v2: 1.5,            // 边线宽度
        gap: 13,            // 整体间距（道路模式=矩形半宽）
        density: 20,        // 虚线密度（dash 长度）
        c1: "#ffcc00",      // 中线颜色
        c2: "#ffffff",      // 边线颜色
        endpoint: 0,        // 0=单端(仅终点) 1=头尾双端
        headShape: "none",  // none/arrow/circle/rect
        headSize: 15,
        headColor: "#ffcc00",
        tailShape: "none",
        tailSize: 15,
        tailColor: "#ffffff",
        corner: false,      // false=平滑曲线 true=直角折线
        link: true,         // 头尾联动（尾部跟随头部参数）
        flow: 0             // 0=内置样条 1=选中路径层
    };

    var SHAPE_NAMES = ["无", "箭头", "圆点", "方块"];

    // CEP 原版四预设（模式=预设参数组合）
    var PRESETS = [
        { name: "经典路感", mode: 1, v1: 8,   c1: "#ffcc00", v2: 1.5, c2: "#ffffff", gap: 13, density: 20 },
        { name: "科技样条", mode: 1, v1: 5,   c1: "#ffcc00", v2: 4.5, c2: "#ffffff", gap: 24, density: 273 },
        { name: "双层叠压", mode: 2, v1: 8,   c1: "#ffffff", v2: 8,   c2: "#ffcc00", gap: 0,  density: 41 },
        { name: "道路标识", mode: 3, v1: 4,   c1: "#ffffff", v2: 2,   c2: "#ffffff", gap: 15, density: 30 }
    ];

    // 套用预设（CEP applyPreset：切模式=整套参数，重置折角）
    function applyPreset(idx) {
        var p = PRESETS[idx];
        state.mode = p.mode;
        state.v1 = p.v1;
        state.v2 = p.v2;
        state.gap = p.gap;
        state.density = p.density;
        state.c1 = p.c1;
        state.c2 = p.c2;
        state.corner = false;
        log("已套用预设「" + p.name + "」: 中线宽" + p.v1
            + " 边线宽" + p.v2 + " 间距" + p.gap + " 密度" + p.density
            + "（注意：面板滑块显示不会自动刷新，以本次套用值为准）");
    }

    // ---------------- 几何工具 ----------------

    function node(point, inTan, outTan) {
        return { point: point, inTan: inTan || [0, 0], outTan: outTan || [0, 0] };
    }

    // 内置样条：CEP 原版固定 200×170 视口几何，整体居中于画布
    // （CEP generateSpline: offsetX = comp.width/2 - 100, offsetY = comp.height/2 - 85）
    function buildSampleNodes(scene) {
        var ox = scene.width / 2 - 100;
        var oy = scene.height / 2 - 85;
        var p0 = [20 + ox, 130 + oy];
        var corner = [100 + ox, 130 + oy];
        var p2 = [180 + ox, 40 + oy];

        // 道路模式：3 点共线（中点在起终点连线上）
        if (state.mode === 3) {
            var mid = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
            return [node(p0), node(mid), node(p2)];
        }
        // 直角折线：无手柄
        if (state.corner) {
            return [node(p0), node(corner), node(p2)];
        }
        // 平滑 S 曲线：CEP t=0 全展开手柄（绝对像素，大弧度 S 弯）
        var cp1 = [60 + ox, 30 + oy];
        var cp2 = [140 + ox, 130 + oy];
        return [
            node(p0, [0, 0], [cp1[0] - p0[0], cp1[1] - p0[1]]),
            node(corner, [cp1[0] - corner[0], cp1[1] - corner[1]],
                        [cp2[0] - corner[0], cp2[1] - corner[1]]),
            node(p2, [cp2[0] - p2[0], cp2[1] - p2[1]], [0, 0])
        ];
    }

    // 法线方向（前后锚点连线的垂直向量，CEP calcNormalAt）
    function normalAt(nodes, idx, width) {
        var n = nodes.length;
        var prev = nodes[idx > 0 ? idx - 1 : 0].point;
        var next = nodes[idx < n - 1 ? idx + 1 : n - 1].point;
        var dx = next[0] - prev[0];
        var dy = next[1] - prev[1];
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) { return [0, 0]; }
        return [-dy / len * width, dx / len * width];
    }

    // 道路矩形：上边正序 + 法线偏移，下边倒序 - 法线偏移，闭合
    function roadRectNodes(nodes, gap) {
        var rect = [];
        var i;
        var nrm;
        for (i = 0; i < nodes.length; i++) {
            nrm = normalAt(nodes, i, gap);
            rect.push(node([nodes[i].point[0] + nrm[0],
                            nodes[i].point[1] + nrm[1]]));
        }
        for (i = nodes.length - 1; i >= 0; i--) {
            nrm = normalAt(nodes, i, gap);
            rect.push(node([nodes[i].point[0] - nrm[0],
                            nodes[i].point[1] - nrm[1]]));
        }
        return rect;
    }

    // 终点切线角（度）：终点入射手柄反方向，退化用末两点连线
    function endAngle(nodes) {
        var last = nodes[nodes.length - 1];
        var dx = -last.inTan[0];
        var dy = -last.inTan[1];
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 && nodes.length > 1) {
            dx = last.point[0] - nodes[nodes.length - 2].point[0];
            dy = last.point[1] - nodes[nodes.length - 2].point[1];
        }
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    // 起点切线角：起点出射手柄，退化用首两点连线
    function startAngle(nodes) {
        var first = nodes[0];
        var dx = first.outTan[0];
        var dy = first.outTan[1];
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 && nodes.length > 1) {
            dx = nodes[1].point[0] - first.point[0];
            dy = nodes[1].point[1] - first.point[1];
        }
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    // 顶点绕原点旋转 deg 后平移到 center
    function place(p, angleDeg, center) {
        var r = angleDeg * Math.PI / 180;
        var c = Math.cos(r);
        var s = Math.sin(r);
        return [p[0] * c - p[1] * s + center[0],
                p[0] * s + p[1] * c + center[1]];
    }

    // 端点形状节点集（箭头=三角+圆角描边，圆=8点贝塞尔，方块）
    function shapeNodes(kind, size, center, angleDeg) {
        var s = size;
        var raw = [];
        var closed = true;
        var k = 4 * Math.tan(Math.PI / 16) / 3; // 8 点圆最优手柄系数

        if (kind === "arrow") {
            // 圆角等腰三角形，顶点居中于原点（CEP 同款几何）
            raw = [node([s + s / 3, 0]),
                   node([-s + s / 3, -s]),
                   node([-s + s / 3, s])];
        } else if (kind === "circle") {
            for (var a = 0; a < 8; a++) {
                var ang = a * Math.PI / 4;
                raw.push(node([s * Math.cos(ang), s * Math.sin(ang)],
                              [ s * k * Math.sin(ang), -s * k * Math.cos(ang)],
                              [-s * k * Math.sin(ang),  s * k * Math.cos(ang)]));
            }
        } else { // rect
            raw = [node([-s / 2, -s / 2]), node([s / 2, -s / 2]),
                   node([s / 2, s / 2]), node([-s / 2, s / 2])];
        }

        var out = [];
        for (var i = 0; i < raw.length; i++) {
            var p = place(raw[i].point, angleDeg, center);
            var it = place([raw[i].point[0] + raw[i].inTan[0],
                            raw[i].point[1] + raw[i].inTan[1]], angleDeg, [0, 0]);
            var ot = place([raw[i].point[0] + raw[i].outTan[0],
                            raw[i].point[1] + raw[i].outTan[1]], angleDeg, [0, 0]);
            out.push(node(p,
                          [it[0] - p[0], it[1] - p[1]],
                          [ot[0] - p[0], ot[1] - p[1]]));
        }
        return { nodes: out, closed: closed, roundJoin: kind === "arrow" };
    }

    // ---------------- 路径来源 ----------------

    // 从选中的钢笔路径层读取节点（pathInfo 数组按 nodeId 索引可能有洞）
    function nodesFromSelection(scene) {
        var sel = scene.selectedLayers();
        if (!sel || sel.length === 0) {
            throw "请先选中一个钢笔路径图层（或切回「内置样条」模式）";
        }
        var layer = sel[0];
        var paths = layer.paths();
        if (!paths || paths.length === 0) {
            throw "选中图层 \"" + layer.name + "\" 不是矢量路径层（用钢笔工具画的图层才是）";
        }
        var info = paths[0].pathInfo();
        if (!info || !info.nodes || info.nodes.length < 2) {
            throw "路径为空（至少需要 2 个节点）";
        }
        // 收集有效节点（跳过 dissolved 留下的洞）
        var nodes = [];
        for (var i = 0; i < info.nodes.length; i++) {
            var nd = info.nodes[i];
            if (nd && nd.point) { nodes.push(node(nd.point, nd.inTan, nd.outTan)); }
        }
        if (nodes.length < 2) {
            throw "路径有效节点不足（至少 2 个）";
        }
        // 路径坐标是图层局部坐标：补偿图层位移，对齐场景坐标
        var pos = layer.property("position").value();
        if (pos && (Math.abs(pos[0]) > 0.01 || Math.abs(pos[1]) > 0.01)) {
            for (var j = 0; j < nodes.length; j++) {
                nodes[j].point[0] += pos[0];
                nodes[j].point[1] += pos[1];
            }
        }
        return { nodes: nodes, closed: info.closed };
    }

    // ---------------- 生成 ----------------

    function makeLayer(scene, group, name, nodes, closed) {
        var layer = scene.addPath(name, nodes, closed);
        if (!layer) { throw "创建路径图层失败: " + name; }
        layer.setParentLayer(group);
        return layer;
    }

    function applyDash(layer, scene) {
        var dash = Math.max(2, state.density);
        var gapLen = dash * 0.8;
        var period = dash + gapLen;
        // 虚线流动：offset 关键帧，每步位移恰为一个周期 → 无缝循环
        var fps = scene.fps || 30;
        var totalFrames = Math.max(1, Math.round(scene.duration * fps));
        var step = Math.max(2, Math.round(period / 50 * fps)); // ≈50px/s
        var keys = [];
        for (var f = 0; f <= totalFrames; f += step) {
            keys.push([f, (f / step) * period]);
        }
        // 末尾不满一步时补终点帧，保证播放全程都在流动
        if (totalFrames % step !== 0) {
            keys.push([totalFrames, (totalFrames / step) * period]);
        }
        if (keys.length < 2) { keys = [[0, 0], [totalFrames, period]]; }
        var ok = layer.addPathEffect("dash", {
            dash: dash, gap: gapLen, offset: 0, offsetKeys: keys
        });
        log("dash特效: " + (ok ? "已添加" : "添加失败!")
            + " dash=" + dash + " gap=" + gapLen.toFixed(1)
            + " 关键帧" + keys.length + "个(0.." + totalFrames + "帧)");
    }

    function generate() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景"); return; }

        app.beginUndoGroup("生成地图划线");
        try {
            // 路径来源（须在清选之前读取选中图层）
            var pathData;
            if (state.flow === 1) {
                pathData = nodesFromSelection(scene);
                log("路径来源: 选中路径层 (" + pathData.nodes.length + " 节点)");
            } else {
                pathData = { nodes: buildSampleNodes(scene), closed: false };
                log("路径来源: 内置样条");
            }

            // 清空选择：确保新图层加到场景顶层而不是用户选中的嵌套组
            var selClear = scene.selectedLayers();
            if (selClear) {
                for (var si = 0; si < selClear.length; si++) {
                    selClear[si].selected = false;
                }
            }

            // 幂等：删除上一次生成的组（一步撤销可回退）
            var old = scene.layer(GROUP_NAME);
            if (old) {
                old.remove();
                log("已删除旧的 " + GROUP_NAME);
            }
            var nodes = pathData.nodes;
            var closed = pathData.closed;

            var group = scene.addGroup(GROUP_NAME);
            if (!group) { throw "创建组失败"; }

            // CEP 语义：图层轴心在内容中心（拖动/缩放围绕内容而不是左上角）
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (var gi = 0; gi < nodes.length; gi++) {
                var gp = nodes[gi].point;
                if (gp[0] < minX) { minX = gp[0]; }
                if (gp[1] < minY) { minY = gp[1]; }
                if (gp[0] > maxX) { maxX = gp[0]; }
                if (gp[1] > maxY) { maxY = gp[1]; }
            }
            group.setAnchorPoint([(minX + maxX) / 2, (minY + maxY) / 2]);

            var created = [];

            // 添加顺序 = 视觉层级（Friction 后添加的在上方，与 AE 相反）：
            // 底线/道路边框（最底）→ 中线虚线 → 尾部 → 头部（最上）
            // CEP 绑定语义：所有部件 reparent 到「中线虚线」层——
            // 移动/旋转/缩放中线层时整条线联动（恒等变换下视觉不变）
            var baseLayer = null;
            if (state.mode === 3) {
                // 道路标识：矩形框 + 中线虚线
                var rectNodes = roadRectNodes(nodes, state.gap);
                var rl = makeLayer(scene, group, "道路边框", rectNodes, true);
                rl.setStroke({ width: state.v2, color: state.c2,
                               cap: "butt", join: "miter" });
                created.push("道路边框");
                baseLayer = rl;
            } else if (state.mode === 1) {
                // 经典路感：底层粗线（模拟双侧边线+间距）
                var bl = makeLayer(scene, group, "底层边线", nodes, closed);
                bl.setStroke({ width: state.v1 + state.gap * 2 + state.v2 * 2,
                               color: state.c2, cap: "round", join: "round" });
                created.push("底层边线");
                baseLayer = bl;
            } else {
                // 双层叠压：底层实线
                var sl = makeLayer(scene, group, "底层线", nodes, closed);
                sl.setStroke({ width: state.v2, color: state.c2,
                               cap: "round", join: "round" });
                created.push("底层线");
                baseLayer = sl;
            }

            // 中线虚线（叠在底层线上）= 绑定宿主
            var cl = makeLayer(scene, group, "中线虚线", nodes, closed);
            cl.setStroke({ width: state.v1, color: state.c1,
                           cap: "round", join: "round" });
            applyDash(cl, scene);
            created.push("中线虚线");
            if (baseLayer) { baseLayer.setTransformParent(cl); }

            // 端点形状（最上层，同样绑到中线层）
            var tailShape = state.link ? state.headShape : state.tailShape;
            var tailSize = state.link ? state.headSize : state.tailSize;
            var tailColor = state.link ? state.headColor : state.tailColor;
            if (state.endpoint === 1 && tailShape !== "none") {
                var tlShape = shapeNodes(tailShape, tailSize,
                                          nodes[0].point, startAngle(nodes));
                var tl = makeLayer(scene, group, "尾部形状",
                                   tlShape.nodes, tlShape.closed);
                tl.setFill({ color: tailColor });
                if (tlShape.roundJoin) {
                    tl.setStroke({ width: tailSize * 0.3, color: tailColor,
                                   cap: "round", join: "round" });
                }
                tl.setTransformParent(cl);
                created.push("尾部形状");
            }
            if (state.headShape !== "none") {
                var headShape = shapeNodes(state.headShape, state.headSize,
                                            nodes[nodes.length - 1].point,
                                            endAngle(nodes));
                var hl = makeLayer(scene, group, "头部形状",
                                   headShape.nodes, headShape.closed);
                hl.setFill({ color: state.headColor });
                if (headShape.roundJoin) {
                    // 箭头圆角：同色粗描边 + 圆角连接（CEP 同款技巧）
                    hl.setStroke({ width: state.headSize * 0.3,
                                   color: state.headColor,
                                   cap: "round", join: "round" });
                }
                hl.setTransformParent(cl);
                created.push("头部形状");
            }

            log("生成完成: " + created.join(" + ")
                + " | 模式" + state.mode
                + " | 中线宽" + state.v1 + " 边线宽" + state.v2
                + " 间距" + state.gap + " 密度" + Math.max(2, state.density));

            // 几何读回（animator 原始数据，可靠）：打印中线首尾顶点，
            // 供与 AE 成品逐点对照（AE 视口 200×170 + 居中偏移）
            var clPaths = cl.paths();
            if (clPaths && clPaths.length > 0) {
                var info = clPaths[0].pathInfo();
                if (info && info.nodes && info.nodes.length > 0) {
                    var first = null;
                    var last = null;
                    for (var ci = 0; ci < info.nodes.length; ci++) {
                        if (info.nodes[ci]) {
                            if (!first) { first = info.nodes[ci]; }
                            last = info.nodes[ci];
                        }
                    }
                    log("几何读回: 首点=(" + first.point[0].toFixed(1) + ","
                        + first.point[1].toFixed(1) + ") 尾点=("
                        + last.point[0].toFixed(1) + ","
                        + last.point[1].toFixed(1) + ") 节点数="
                        + info.nodes.length + " 闭合=" + info.closed);
                }
            }

            // CEP 语义：生成成功后隐藏引导路径层（保留以便再次调整）
            var guide = scene.layer("划线引导路径");
            if (guide && guide.visible) {
                guide.visible = false;
                log("引导路径层已隐藏（需要再调整时在时间轴重新点亮小眼睛）");
            }
        } catch (e) {
            log("生成失败: " + e);
            alert("生成失败: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // 创建引导路径层：生成一条可编辑的 S 形线，供钢笔工具调整后按「选中路径层」生成
    function createGuideLayer() {
        var scene = app.activeScene;
        if (!scene) { alert("请先打开一个场景"); return; }
        app.beginUndoGroup("创建引导路径层");
        try {
            // 清选：保证新图层落在场景顶层
            var selClear = scene.selectedLayers();
            if (selClear) {
                for (var si = 0; si < selClear.length; si++) {
                    selClear[si].selected = false;
                }
            }
            var old = scene.layer("划线引导路径");
            if (old) {
                // 已存在：不删除（保留用户调整过的形状），重新显示
                old.visible = true;
                log("引导路径层已存在，已重新显示");
                alert("「划线引导路径」图层已重新显示\n"
                      + "继续用节点工具调整形状，调整完选中它再点生成");
                return;
            }
            var nodes = buildSampleNodes(scene);
            var layer = scene.addPath("划线引导路径", nodes, false);
            if (!layer) { throw "创建失败"; }
            // 引导线预览样式：细虚线
            layer.setStroke({ width: 3, color: "#4da6ff", cap: "round" });
            layer.addPathEffect("dash", { dash: 10, gap: 8, offset: 0 });
            log("已创建引导路径层");
            alert("已创建「划线引导路径」图层\n"
                  + "用节点编辑工具调整形状后，\n"
                  + "把「路径来源」切到「选中路径层」并选中它，再点生成");
        } catch (e) {
            log("创建引导层失败: " + e);
            alert("创建失败: " + e);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---------------- 面板 ----------------

    registerPanel({
        title: "地图划线",
        columns: 4,
        combos: [
            { label: "预设", id: "mode",
              options: ["经典路感", "科技样条", "双层叠压", "道路标识"], index: 0,
              tooltip: "每个预设=CEP原版整套参数组合（切到科技样条试试长虚线）",
              onChange: function (i) { applyPreset(i); } },
            { label: "路径来源", id: "flow",
              options: ["内置样条", "选中路径层"], index: 0,
              tooltip: "选中路径层=读取钢笔工具画的矢量路径图层（可先点下方「创建引导路径层」）",
              onChange: function (i) { state.flow = i; } },
            { label: "端点", id: "endpoint",
              options: ["单端（仅终点）", "头尾双端"], index: 0,
              onChange: function (i) { state.endpoint = i; } },
            { label: "头部形状", id: "headShape",
              options: SHAPE_NAMES, index: 0,
              onChange: function (i, text) { state.headShape = ["none", "arrow", "circle", "rect"][i]; } },
            { label: "尾部形状", id: "tailShape",
              options: SHAPE_NAMES, index: 0,
              tooltip: "头尾联动开启时此项无效",
              onChange: function (i) { state.tailShape = ["none", "arrow", "circle", "rect"][i]; } },
            { label: "线条形态", id: "corner",
              options: ["平滑曲线", "直角折线"], index: 0,
              tooltip: "仅对内置样条生效",
              onChange: function (i) { state.corner = i === 1; } },
            { label: "头尾联动", id: "link",
              options: ["联动", "独立"], index: 0,
              tooltip: "联动=尾部形状/大小/颜色跟随头部",
              onChange: function (i) { state.link = i === 0; } }
        ],
        colors: [
            { label: "中线", id: "c1", value: "#ffcc00",
              tooltip: "中线颜色", onChange: function (v, hex) { state.c1 = hex; } },
            { label: "边线", id: "c2", value: "#ffffff",
              tooltip: "边线/道路框颜色", onChange: function (v, hex) { state.c2 = hex; } },
            { label: "头部", id: "hc", value: "#ffcc00",
              tooltip: "头部形状颜色", onChange: function (v, hex) { state.headColor = hex; } },
            { label: "尾部", id: "tc", value: "#ffffff",
              tooltip: "尾部形状颜色（联动时跟随头部）",
              onChange: function (v, hex) { state.tailColor = hex; } }
        ],
        sliders: [
            { label: "中线宽度", id: "v1", min: 1, max: 20, value: 8,
              decimals: 1, tooltip: "中线虚线的描边宽度",
              onChange: function (v) { state.v1 = v; } },
            { label: "边线宽度", id: "v2", min: 0.5, max: 10, value: 1.5,
              decimals: 1, tooltip: "边线描边宽度（道路模式=矩形框线宽）",
              onChange: function (v) { state.v2 = v; } },
            { label: "整体间距", id: "gap", min: 0, max: 40, value: 13,
              decimals: 0, tooltip: "中线与边线的间距（道路模式=道路半宽）",
              onChange: function (v) { state.gap = v; } },
            { label: "虚线密度", id: "density", min: 2, max: 300, value: 20,
              decimals: 0, tooltip: "虚线段长度（间隙=长度×0.8），越小越密",
              onChange: function (v) { state.density = v; } },
            { label: "头部大小", id: "hsize", min: 5, max: 50, value: 15,
              decimals: 0, onChange: function (v) { state.headSize = v; } },
            { label: "尾部大小", id: "tsize", min: 5, max: 50, value: 15,
              decimals: 0, tooltip: "联动时跟随头部大小",
              onChange: function (v) { state.tailSize = v; } }
        ],
        extraButtons: [
            { label: "▶ 生成地图划线", tooltip: "按当前参数生成（重复生成会先删除旧结果）",
              onClick: generate },
            { label: "✎ 创建引导路径层", tooltip: "生成一条可编辑的示例线，用节点工具调整后作为路径来源",
              onClick: createGuideLayer }
        ]
    });
})();
