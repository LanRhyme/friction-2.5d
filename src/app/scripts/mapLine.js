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

    // 端点形状：直接用现有图形工具（圆=椭圆层/方=矩形层/箭头=路径层）。
    // 层几何以自身原点为中心，初始 position=端点；再挂三表达式
    // （$path("中线虚线").end.x 等）实时跟随端点
    function makeShapeLayer(scene, group, name, kind, size, color, atPoint) {
        var layer = null;
        if (kind === "circle") {
            layer = scene.addEllipse(name + "圆点", atPoint[0], atPoint[1], size);
            if (layer) {
                layer.setFill({ color: color });
                layer.setStroke({ enabled: false });
            }
        } else if (kind === "rect") {
            // 矩形几何以 (0,0) 为中心：层原点=矩形中心，position 表达式即中心位置
            layer = scene.addRect(name + "方块", -size / 2, -size / 2,
                                  size, size);
            if (layer) {
                layer.setFill({ color: color });
                layer.setStroke({ enabled: false });
                layer.property("position").setValue(atPoint);
            }
        } else { // arrow：圆角三角=原点中心路径+同色粗描边（CEP 同款技巧）
            var s = size;
            var tri = [node([s + s / 3, 0]),
                       node([-s + s / 3, -s]),
                       node([-s + s / 3, s])];
            layer = scene.addPath(name + "箭头", tri, true);
            if (layer) {
                layer.setFill({ color: color });
                layer.setStroke({ width: size * 0.3, color: color,
                                  cap: "round", join: "round" });
                layer.property("position").setValue(atPoint);
                layer.setParentLayer(group);
            }
        }
        if (!layer) { throw "创建端点形状失败: " + name; }
        if (kind !== "arrow") { layer.setParentLayer(group); }
        bindShapeToPath(layer, "中线虚线", name.indexOf("尾") === 0 ? false : true);
        return layer;
    }

    // 端点形状三表达式绑定（AE 同款：位置=路径端点，旋转=切线方向）
    function bindShapeToPath(layer, srcName, endPoint) {
        var pt = endPoint ? "end" : "start";
        var errs = [];
        var bx = layer.property("positionx").setExpression(
            "x = $path(\"" + srcName + "\")." + pt + ".x;", "return x;");
        if (bx) { errs.push("x:" + bx); }
        var by = layer.property("positiony").setExpression(
            "y = $path(\"" + srcName + "\")." + pt + ".y;", "return y;");
        if (by) { errs.push("y:" + by); }
        var br = layer.property("rotation").setExpression(
            "a = $path(\"" + srcName + "\")." + pt + ".angle;", "return a;");
        if (br) { errs.push("角度:" + br); }
        log(layer.name + " 端点表达式" + (pt === "end" ? "(终点)" : "(起点)")
            + (errs.length === 0 ? " 绑定成功" : " 失败: " + errs.join("; ")));
        return errs.length === 0;
    }

    // ---------------- 路径来源 ----------------

    // 从指定路径层读取节点（pathInfo 数组按 nodeId 索引可能有洞）
    function nodesFromLayer(layer, label) {
        if (!layer) {
            throw label + " 不存在";
        }
        var paths = layer.paths();
        if (!paths || paths.length === 0) {
            throw "图层 \"" + layer.name + "\" 不是矢量路径层（用钢笔工具画的图层才是）";
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
        // （.value 被 Q_PROPERTY 遮蔽成属性，不能用 .value() 调用）
        var pv = layer.property("position");
        var pos = (pv && typeof pv.value === "function") ? pv.value() : pv.value;
        if (pos && (Math.abs(pos[0]) > 0.01 || Math.abs(pos[1]) > 0.01)) {
            for (var j = 0; j < nodes.length; j++) {
                nodes[j].point[0] += pos[0];
                nodes[j].point[1] += pos[1];
            }
        }
        log("路径来源: " + label + " \"" + layer.name
            + "\" (" + nodes.length + " 节点)");
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
            // 路径来源（须在清选之前读取选中图层）：
            // 选中的路径层（用「绘制路径」工具画的）> 内置样条
            var pathData = null;
            var pathSourceLayer = null;
            var selLayers = scene.selectedLayers();
            if (selLayers && selLayers.length > 0) {
                try {
                    pathData = nodesFromLayer(selLayers[0], "选中路径层");
                    pathSourceLayer = selLayers[0];
                } catch (e) {
                    log("选中图层不是可用路径，改用内置样条 (" + e + ")");
                }
            }
            if (!pathData) {
                pathData = { nodes: buildSampleNodes(scene), closed: false };
                log("路径来源: 内置样条（画自己的路线：用「绘制路径」工具画一条线并选中，再点生成）");
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
            // AE 共享路径语义：底线/道路框通过 setPathSource 引用中线层
            // 的路径几何（拖中线层锚点实时同步）；道路框叠加法线偏移
            var baseLayer = null;
            if (state.mode === 3) {
                // 道路标识：引用路径+法线偏移 outlineOffset=gap 生成闭合框
                var rl = makeLayer(scene, group, "道路边框", nodes, closed);
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

            // 中线虚线（叠在底层线上）= 路径宿主（锚点编辑在这一层做）
            var cl = makeLayer(scene, group, "中线虚线", nodes, closed);
            cl.setStroke({ width: state.v1, color: state.c1,
                           cap: "round", join: "round" });
            applyDash(cl, scene);
            created.push("中线虚线");

            // 底线/道路框 → 路径引用中线层（节点编辑实时同步）
            // + transform 绑定（移动/旋转/缩放中线层时整线联动）
            if (baseLayer) {
                var off = state.mode === 3 ? state.gap : 0;
                var linkOk = baseLayer.setPathSource(cl, off);
                baseLayer.setTransformParent(cl);
                log(baseLayer.name + " 路径引用中线层: "
                    + (linkOk ? "已绑定" : "失败!")
                    + (state.mode === 3 ? " (法线偏移 " + state.gap + ")" : ""));
            }

            // 端点形状（最上层）：现有图形工具生成（圆=椭圆层/方=矩形层/箭头=路径层），
            // 初始位置直接设到端点（表达式接管前的保底位置），再挂端点表达式
            var tailShape = state.link ? state.headShape : state.tailShape;
            var tailSize = state.link ? state.headSize : state.tailSize;
            var tailColor = state.link ? state.headColor : state.tailColor;
            if (state.endpoint === 1 && tailShape !== "none") {
                var tl = makeShapeLayer(scene, group, "尾部形状",
                                        tailShape, tailSize, tailColor,
                                        nodes[0].point);
                created.push("尾部形状(" + tl.name + ")");
            }
            if (state.headShape !== "none") {
                var hl = makeShapeLayer(scene, group, "头部形状",
                                        state.headShape, state.headSize,
                                        state.headColor,
                                        nodes[nodes.length - 1].point);
                created.push("头部形状(" + hl.name + ")");
            }

            // 踢一脚：换帧再换回，强制所有新挂的表达式立即求值出正确初值
            var curFrame = scene.currentFrame;
            scene.currentFrame = curFrame + 1;
            scene.currentFrame = curFrame;

            log("生成完成: " + created.join(" + ")
                + " | 模式" + state.mode
                + " | 中线宽" + state.v1 + " 边线宽" + state.v2
                + " 间距" + state.gap + " 密度" + Math.max(2, state.density)
                + "（拖锚点请选中「中线虚线」层）");

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

            // 生成成功后自动删除引用的源路径层（同撤销组内，
            // Ctrl+Z 可连生成结果一起还原）
            if (pathSourceLayer) {
                try {
                    var srcName = pathSourceLayer.name;
                    if (pathSourceLayer.valid()) {
                        pathSourceLayer.remove();
                        log("已自动删除源路径层 \"" + srcName
                            + "\"（想改路线：Ctrl+Z 撤销后重新画，或直接编辑"
                            + "「中线虚线」层的锚点）");
                    }
                } catch (delE) {
                    log("源路径层删除失败（可手动删除）: " + delE);
                }
            }
        } catch (e) {
            log("生成失败: " + e);
            alert("生成失败: " + e);
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
            { label: "▶ 生成地图划线",
              tooltip: "选中「绘制路径」工具画的路径层后生成=按你的路线；未选中=内置样条（重复生成会先删除旧结果）",
              onClick: generate }
        ]
    });
})();
